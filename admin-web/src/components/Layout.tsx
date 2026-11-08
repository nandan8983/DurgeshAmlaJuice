import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../store/auth';

const LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/customers', label: 'Customers' },
  { to: '/subscriptions', label: 'Subscriptions' },
  { to: '/team', label: 'Riders & supervisors' },
  { to: '/leads', label: 'Leads' },
  { to: '/reports', label: 'Reports' },
  { to: '/plans', label: 'Plans' },
];

export function Layout(): React.JSX.Element {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          Durgesh Amla Juice
          <span>Delivery management</span>
        </div>

        <nav>
          {LINKS.map(link => (
            <NavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="who">
          <div>
            <strong>{user?.name}</strong>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>{user?.role}</div>
          <button type="button" className="secondary small" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
