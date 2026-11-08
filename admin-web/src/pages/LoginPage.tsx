import { useState } from 'react';
import { useAuth } from '../store/auth';
import { API_BASE_URL } from '../lib/api';
import { Alert, Field } from '../components/ui';

export function LoginPage(): React.JSX.Element {
  const { login, error } = useAuth();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      await login(mobile, password);
    } catch {
      // The auth store keeps the message.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="card login-card" onSubmit={submit}>
        <h1>Durgesh Amla Juice</h1>
        <p className="sub">Admin &amp; supervisor dashboard</p>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <Field label="Mobile number">
          <input
            value={mobile}
            onChange={event => setMobile(event.target.value)}
            autoComplete="username"
            inputMode="tel"
            required
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="muted" style={{ textAlign: 'center', marginTop: '1rem' }}>
          API: {API_BASE_URL}
        </p>
      </form>
    </div>
  );
}
