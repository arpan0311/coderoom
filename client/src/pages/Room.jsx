import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import * as Y from 'yjs';
import { api, getToken, SOCKET_URL } from '../api.js';
import { useAuth } from '../auth.jsx';
import CodeEditor from '../components/CodeEditor.jsx';
import VideoCall from '../components/VideoCall.jsx';
import Chat from '../components/Chat.jsx';
import RunResults from '../components/RunResults.jsx';
import Timer from '../components/Timer.jsx';
import RichText from '../components/RichText.jsx';

function Example({ n, input, expected }) {
  return (
    <div className="example">
      <p className="io-label">Example {n} · input</p>
      <pre className="io">{input}</pre>
      <p className="io-label">output</p>
      <pre className="io">{expected}</pre>
    </div>
  );
}

export default function Room() {
  const { code } = useParams();
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [error, setError] = useState('');
  const [socket, setSocket] = useState(null);
  const [ydoc] = useState(() => new Y.Doc());
  const [synced, setSynced] = useState(false);
  const [joinCount, setJoinCount] = useState(0);
  const [online, setOnline] = useState([]);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(null);
  const [copied, setCopied] = useState(false);
  const [languages, setLanguages] = useState([]);
  const [langMap, setLangMap] = useState({}); // "q0" -> "python", shared through Yjs
  const editorRef = useRef(null);

  useEffect(() => {
    api('/languages').then((d) => setLanguages(d.languages)).catch(() => {});
  }, []);

  // The chosen language per question lives in the shared Yjs doc, so both people always match.
  useEffect(() => {
    const meta = ydoc.getMap('meta');
    const onChange = () => setLangMap(meta.toJSON());
    meta.observe(onChange);
    onChange();
    return () => meta.unobserve(onChange);
  }, [ydoc]);

  const loadRoom = useCallback(
    () =>
      api(`/rooms/${code}`)
        .then((d) => setRoom(d.room))
        .catch((e) => setError(e.message)),
    [code],
  );

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  // Connect the socket after the room loads (loading it is what assigns the candidate).
  const roomLoaded = Boolean(room);
  useEffect(() => {
    if (!roomLoaded) return;
    const s = io(SOCKET_URL, { auth: { token: getToken() } });

    // Local edits -> server. Remote edits are applied with origin "remote" so we don't echo them back.
    const onLocalUpdate = (update, origin) => {
      if (origin !== 'remote') s.emit('yjs-update', update);
    };
    ydoc.on('update', onLocalUpdate);

    s.on('connect', () => {
      s.emit('join-room', { code }, (res) => {
        if (!res?.ok) return setError(res?.error || 'Could not join the room');
        Y.applyUpdate(ydoc, new Uint8Array(res.state), 'remote');
        // After a reconnect, send anything we typed while offline. Yjs merges it safely.
        s.emit('yjs-update', Y.encodeStateAsUpdate(ydoc));
        setSynced(true);
        setJoinCount((n) => n + 1);
      });
    });
    s.on('connect_error', (err) => err.message === 'unauthorized' && setError('Please log in again'));
    s.on('yjs-update', (u) => Y.applyUpdate(ydoc, new Uint8Array(u), 'remote'));
    s.on('presence', setOnline);
    s.on('room-updated', loadRoom);
    s.on('run-started', setRunning);
    s.on('run-result', (r) => {
      setResult(r);
      setRunning(null);
    });
    setSocket(s);

    return () => {
      ydoc.off('update', onLocalUpdate);
      s.disconnect();
    };
  }, [roomLoaded, code, ydoc, loadRoom]);

  if (error) {
    return (
      <div className="center">
        <div className="card">
          <h2>Can't open this room</h2>
          <p className="error">{error}</p>
          <Link to="/" className="btn btn-ghost">Back to dashboard</Link>
        </div>
      </div>
    );
  }
  if (!room) return <div className="center muted">Loading room…</div>;

  const isInterviewer = room.myRole === 'interviewer';
  const qIndex = room.currentQuestion;
  const question = room.questions[qIndex];
  const expired = room.deadline && Date.now() > new Date(room.deadline).getTime();
  const ended = room.status === 'ended' || expired;
  const other = isInterviewer ? room.candidate : room.interviewer;
  const otherOnline = other && online.some((u) => u.id === other._id);
  const lang = langMap[`q${qIndex}`];
  const langInfo = languages.find((l) => l.id === lang);

  const changeLanguage = (language) => socket?.emit('set-language', { questionIndex: qIndex, language });

  const run = async (mode) => {
    setRunning({ by: user.name, mode });
    try {
      const code = editorRef.current?.getValue() ?? '';
      const r = await api(`/rooms/${room.code}/run`, {
        method: 'POST',
        body: { code, questionIndex: qIndex, language: lang, mode },
      });
      setResult(r);
    } catch (e) {
      setResult(null);
      alert(e.message);
    } finally {
      setRunning(null);
    }
  };

  const action = (path, method = 'POST', body) => api(`/rooms/${room.code}/${path}`, { method, body }).then(loadRoom).catch((e) => alert(e.message));

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${room.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="room">
      <header className="room-bar">
        <Link to="/" className="brand small">{'</>'}</Link>
        <div className="room-title">
          <b>{room.title}</b>
          <span className="muted small">
            Room <code>{room.code}</code>
          </span>
        </div>
        <span className={`pill pill-${ended ? 'ended' : room.status}`}>
          {ended ? 'Ended' : room.status === 'live' ? 'Live' : 'Not started'}
        </span>
        {room.status === 'live' && room.deadline && !ended && <Timer deadline={room.deadline} onExpire={loadRoom} />}
        <span className="muted small presence">
          <span className={`dot ${otherOnline ? 'on' : ''}`} />
          {other ? `${other.name} ${otherOnline ? 'is here' : 'is offline'}` : isInterviewer ? 'No candidate yet' : ''}
        </span>
        <div className="grow" />
        {isInterviewer && (
          <>
            <button className="btn btn-ghost small" onClick={copyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
            {room.status === 'waiting' && <button className="btn btn-primary small" onClick={() => action('start')}>Start interview</button>}
            {room.status !== 'ended' && (
              <button className="btn btn-danger small" onClick={() => confirm('End the interview for everyone?') && action('end')}>
                End
              </button>
            )}
            <Link className="btn btn-ghost small" to={`/room/${room.code}/report`}>Report</Link>
          </>
        )}
      </header>

      <div className="room-body">
        <aside className="panel question">
          {room.questions.length > 1 && (
            <div className="q-tabs">
              {room.questions.map((q, i) => (
                <button
                  key={q._id}
                  className={`q-tab ${i === qIndex ? 'active' : ''}`}
                  disabled={!isInterviewer}
                  title={isInterviewer ? 'Switch question for both of you' : 'The interviewer picks the question'}
                  onClick={() => action('current-question', 'PATCH', { index: i })}
                >
                  Q{i + 1}
                </button>
              ))}
            </div>
          )}
          <h2>{question.title}</h2>
          <span className={`pill pill-${question.difficulty}`}>{question.difficulty}</span>
          <RichText text={question.description} />
          {question.examples.map((ex, i) => (
            <Example key={i} n={i + 1} input={ex.input} expected={ex.expected} />
          ))}
          {question.hiddenCount > 0 && <p className="muted small">+ {question.hiddenCount} hidden tests checked on Submit.</p>}
          {isInterviewer && question.testCases && (
            <details className="small">
              <summary>Hidden tests (only you see these)</summary>
              {question.testCases.filter((t) => t.hidden).map((t, i) => (
                <Example key={i} n={i + 1} input={t.input} expected={t.expected} />
              ))}
            </details>
          )}
        </aside>

        <section className="workspace">
          <div className="editor-wrap">
            {(!synced || !lang) && <div className="editor-overlay">Connecting…</div>}
            {lang && (
              <CodeEditor
                ydoc={ydoc}
                field={`q${qIndex}:${lang}`}
                language={langInfo?.monaco || lang}
                readOnly={ended}
                editorRef={editorRef}
              />
            )}
          </div>
          <div className="run-bar">
            <select
              className="lang-select"
              value={lang || ''}
              disabled={ended || !synced}
              onChange={(e) => changeLanguage(e.target.value)}
              title="Changes the language for both of you"
            >
              {languages.map((l) => (
                <option key={l.id} value={l.id} disabled={!l.available}>
                  {l.name}{l.available ? '' : ' (not installed)'}
                </option>
              ))}
            </select>
            <span className="muted small">runs in an isolated sandbox</span>
            <div className="grow" />
            <button className="btn btn-ghost" disabled={ended || !!running || !langInfo?.available} onClick={() => run('run')}>▶ Run</button>
            <button className="btn btn-primary" disabled={ended || !!running || !langInfo?.available} onClick={() => run('submit')}>Submit</button>
          </div>
          <RunResults result={result?.questionIndex === qIndex ? result : null} running={running} />
        </section>

        <aside className="panel side">
          <VideoCall socket={socket} joinCount={joinCount} />
          <p className="label">Chat</p>
          <Chat socket={socket} initial={room.chat} myId={user._id} />
        </aside>
      </div>
    </div>
  );
}
