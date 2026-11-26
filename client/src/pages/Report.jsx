import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

const DECISIONS = [
  ['', 'Not decided'],
  ['strong_hire', 'Strong hire'],
  ['hire', 'Hire'],
  ['no_hire', 'No hire'],
  ['strong_no_hire', 'Strong no hire'],
];

export default function Report() {
  const { code } = useParams();
  const [data, setData] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/rooms/${code}/report`)
      .then((d) => {
        setData(d);
        setFeedback(d.feedback);
      })
      .catch((e) => setError(e.message));
  }, [code]);

  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!data) return <div className="center muted">Loading report…</div>;

  const { room, codes, languages, submissions, chat } = data;
  const save = async () => {
    try {
      await api(`/rooms/${code}/feedback`, { method: 'PATCH', body: feedback });
      setSaved('Saved ✓');
    } catch (e) {
      setSaved(e.message);
    }
    setTimeout(() => setSaved(''), 2000);
  };

  const best = (qid) => {
    const subs = submissions.filter((s) => s.question?._id === qid);
    return subs.length ? subs.reduce((a, b) => (b.passed > a.passed ? b : a)) : null;
  };

  return (
    <main className="page">
      <div className="card-head">
        <div>
          <h1>{room.title}</h1>
          <p className="muted">
            Room <code>{room.code}</code> · Candidate: <b>{room.candidate?.name || 'none'}</b> · Status: {room.status}
            {room.startedAt && ` · Started ${new Date(room.startedAt).toLocaleString()}`}
          </p>
        </div>
        {room.status !== 'ended' && <Link className="btn btn-ghost" to={`/room/${room.code}`}>Back to room</Link>}
      </div>

      <section className="card">
        <h2>Your feedback</h2>
        <div className="row">
          <label>
            Rating
            <select value={feedback.rating} onChange={(e) => setFeedback({ ...feedback, rating: Number(e.target.value) })}>
              <option value={0}>No rating</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
            </select>
          </label>
          <label>
            Decision
            <select value={feedback.decision} onChange={(e) => setFeedback({ ...feedback, decision: e.target.value })}>
              {DECISIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <label>
          Notes
          <textarea rows={5} value={feedback.notes} onChange={(e) => setFeedback({ ...feedback, notes: e.target.value })} placeholder="Problem solving, code quality, communication…" />
        </label>
        <div className="row">
          <button className="btn btn-primary" onClick={save}>Save feedback</button>
          <span className="muted">{saved}</span>
        </div>
      </section>

      {room.questions.map((q, i) => {
        const b = best(q._id);
        const subs = submissions.filter((s) => s.question?._id === q._id);
        const lang = languages?.[`q${i}`];
        return (
          <section className="card" key={q._id}>
            <div className="card-head">
              <h2>Q{i + 1}. {q.title}</h2>
              {b ? (
                <span className={`pill ${b.passed === b.total ? 'pill-pass' : 'pill-fail'}`}>Best: {b.passed}/{b.total}</span>
              ) : (
                <span className="pill">Not submitted</span>
              )}
            </div>
            <p className="label">Final code {lang && <>({lang})</>}</p>
            <pre className="console">{(lang && codes?.[`q${i}:${lang}`]) || '(empty)'}</pre>
            {subs.length > 0 && (
              <>
                <p className="label">Submissions ({subs.length})</p>
                <table className="table">
                  <thead><tr><th>Time</th><th>By</th><th>Language</th><th>Result</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {subs.map((s) => (
                      <tr key={s._id}>
                        <td>{new Date(s.createdAt).toLocaleTimeString()}</td>
                        <td>{s.submittedBy?.name}</td>
                        <td>{s.language}</td>
                        <td>{s.passed}/{s.total}</td>
                        <td>{s.status}</td>
                        <td>
                          <details>
                            <summary className="small">Code & tests</summary>
                            <pre className="console">{s.code}</pre>
                            {s.compileOutput && <pre className="console error">{s.compileOutput}</pre>}
                            {s.results.map((r, j) => (
                              <div key={j} className="mono small">
                                {r.passed ? '✅' : '❌'} {r.hidden ? '(hidden) ' : ''}
                                input {JSON.stringify(r.input)} → expected {JSON.stringify(r.expected)}, got{' '}
                                {r.actual !== undefined ? JSON.stringify(r.actual) : '—'}
                                {r.error && ` (${r.error})`}
                              </div>
                            ))}
                          </details>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        );
      })}

      <section className="card">
        <h2>Chat log</h2>
        {chat.length === 0 && <p className="muted">No messages.</p>}
        {chat.map((m, i) => (
          <p key={i} className="small">
            <span className="muted">{new Date(m.at).toLocaleTimeString()}</span> <b>{m.name}:</b> {m.text}
          </p>
        ))}
      </section>
    </main>
  );
}
