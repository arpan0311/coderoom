import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/';
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email, form.password);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const demo = (email) => setForm({ email, password: 'demo1234' });

  return (
    <main className="auth-page">
      <section className="auth-hero">
        <p className="eyebrow">Live technical interviews</p>
        <h1>
          Code together. <span className="accent">Run it safely.</span>
        </h1>
        <p className="muted">
          A shared editor, video call and chat in one room. Candidate code runs in an isolated sandbox and is checked
          against hidden test cases.
        </p>
      </section>
      <form className="card auth-card" onSubmit={submit}>
        <h2>Log in</h2>
        <label>
          Email
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          Password
          <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <div className="demo-row">
          <span className="muted small">Try a demo account:</span>
          <button type="button" className="btn btn-ghost small" onClick={() => demo('interviewer@demo.com')}>
            Interviewer
          </button>
          <button type="button" className="btn btn-ghost small" onClick={() => demo('candidate@demo.com')}>
            Candidate
          </button>
        </div>
        <p className="muted small">
          New here? <Link to={`/register${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Create an account</Link>
        </p>
      </form>
    </main>
  );
}
