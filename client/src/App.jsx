import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewQuestion from './pages/NewQuestion.jsx';
import Report from './pages/Report.jsx';

// The room page includes the Monaco editor (big), so load it only when needed.
const Room = lazy(() => import('./pages/Room.jsx'));

function Protected({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="center muted">Loading…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return children;
}

function NavBar() {
  const { user, logout } = useAuth();
  return (
    <header className="nav">
      <Link to="/" className="brand">
        <span className="brand-mark">{'</>'}</span> CodeRoom
      </Link>
      {user && (
        <div className="nav-right">
          <span className="muted">
            {user.name} · <span className={`pill pill-${user.role}`}>{user.role}</span>
          </span>
          <button className="btn btn-ghost" onClick={logout}>
            Log out
          </button>
        </div>
      )}
    </header>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const inRoom = /^\/room\/[^/]+\/?$/.test(pathname);
  return (
    <>
      {!inRoom && <NavBar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<Protected><Dashboard /></Protected>} />
        <Route path="/questions/new" element={<Protected role="interviewer"><NewQuestion /></Protected>} />
        <Route
          path="/room/:code"
          element={
            <Protected>
              <Suspense fallback={<div className="center muted">Loading editor…</div>}>
                <Room />
              </Suspense>
            </Protected>
          }
        />
        <Route path="/room/:code/report" element={<Protected role="interviewer"><Report /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
