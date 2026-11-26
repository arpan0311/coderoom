import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Register() {
  const { user, register } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/';
  // Someone opening an interview link is almost always the candidate.
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: next.startsWith('/room/') ? 'candidate' : 'interviewer',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={next} replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
      navigate(next, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Create account</h2>
        <label>
          Full name
          <input required value={form.name} onChange={set('name')} />
        </label>
        <label>
          Email
          <input type="email" required value={form.email} onChange={set('email')} />
        </label>
        <label>
          Password
          <input type="password" required minLength={6} value={form.password} onChange={set('password')} />
        </label>
        <fieldset className="role-pick">
          <legend>I am a…</legend>
          {['interviewer', 'candidate'].map((r) => (
            <label key={r} className={`role-option ${form.role === r ? 'active' : ''}`}>
              <input type="radio" name="role" value={r} checked={form.role === r} onChange={set('role')} />
              {r === 'interviewer' ? 'Interviewer' : 'Candidate'}
            </label>
          ))}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <p className="muted small">
          Have an account? <Link to={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`}>Log in</Link>
        </p>
      </form>
    </main>
  );
}
