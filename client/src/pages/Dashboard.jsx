import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const STATUS_LABEL = { waiting: 'Not started', live: 'Live', ended: 'Ended' };
const DECISION_LABEL = { strong_hire: 'Strong hire', hire: 'Hire', no_hire: 'No hire', strong_no_hire: 'Strong no hire' };

function RoomsTable({ rooms, isInterviewer }) {
  if (!rooms.length) return <p className="muted">No interviews yet.</p>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Code</th>
          <th>{isInterviewer ? 'Candidate' : 'Interviewer'}</th>
          <th>Status</th>
          {isInterviewer && <th>Decision</th>}
          <th />
        </tr>
      </thead>
      <tbody>
        {rooms.map((r) => (
          <tr key={r._id}>
            <td>{r.title}</td>
            <td><code>{r.code}</code></td>
            <td>{(isInterviewer ? r.candidate?.name : r.interviewer?.name) || <span className="muted">—</span>}</td>
            <td><span className={`pill pill-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
            {isInterviewer && <td>{DECISION_LABEL[r.feedback?.decision] || <span className="muted">—</span>}</td>}
            <td className="actions">
              {r.status !== 'ended' && <Link className="btn btn-ghost small" to={`/room/${r.code}`}>Open</Link>}
              {isInterviewer && <Link className="btn btn-ghost small" to={`/room/${r.code}/report`}>Report</Link>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CreateRoom() {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [title, setTitle] = useState('Frontend Developer — Round 1');
  const [duration, setDuration] = useState(45);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/questions').then((d) => setQuestions(d.questions)).catch((e) => setError(e.message));
  }, []);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { code } = await api('/rooms', { method: 'POST', body: { title, questionIds: picked, durationMinutes: duration } });
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <form className="card" onSubmit={create}>
      <div className="card-head">
        <h2>New interview</h2>
        <Link to="/questions/new" className="btn btn-ghost small">+ Add question</Link>
      </div>
      <div className="row">
        <label className="grow">
          Title
          <input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Time limit
          <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            <option value={0}>No limit</option>
            {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </label>
      </div>
      <p className="label">Questions ({picked.length} picked)</p>
      <div className="question-list">
        {questions.map((q) => (
          <label key={q._id} className={`question-option ${picked.includes(q._id) ? 'active' : ''}`}>
            <input type="checkbox" checked={picked.includes(q._id)} onChange={() => toggle(q._id)} />
            <span className="grow">{q.title}</span>
            <span className={`pill pill-${q.difficulty}`}>{q.difficulty}</span>
            <span className="muted small">{q.testCases.length} tests</span>
          </label>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn btn-primary" disabled={!picked.length}>Create room</button>
    </form>
  );
}

function JoinRoom() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) navigate(`/room/${code.trim().toUpperCase()}`);
      }}
    >
      <h2>Join an interview</h2>
      <p className="muted">Enter the 6-letter code your interviewer sent you, or just open their link.</p>
      <div className="row">
        <input className="grow code-input" placeholder="e.g. K7PQ2M" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn btn-primary">Join</button>
      </div>
    </form>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState(null);
  const isInterviewer = user.role === 'interviewer';

  useEffect(() => {
    api('/rooms').then((d) => setRooms(d.rooms)).catch(() => setRooms([]));
  }, []);

  return (
    <main className="page">
      <h1>Hi, {user.name.split(' ')[0]} 👋</h1>
      {isInterviewer ? <CreateRoom /> : <JoinRoom />}
      <section className="card">
        <h2>{isInterviewer ? 'Your interviews' : 'Your past interviews'}</h2>
        {rooms ? <RoomsTable rooms={rooms} isInterviewer={isInterviewer} /> : <p className="muted">Loading…</p>}
      </section>
    </main>
  );
}
