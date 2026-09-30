import { useEffect, useState } from 'react';

import { getToken, setToken } from './api';
import { SeriesEditor } from './SeriesEditor';
import { SeriesList } from './SeriesList';

// Two screens, addressed by the URL hash so the browser's back button works:
// #/ (series list) and #/series/<id> (editor).
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const match = /^#\/series\/([\w-]+)$/.exec(hash);
  return match ? { screen: 'series' as const, id: match[1] } : { screen: 'list' as const };
}

export function App() {
  const [token, setTokenState] = useState(getToken);
  const route = useHashRoute();

  if (!token) {
    return (
      <SignIn
        onSignIn={(t) => {
          setToken(t);
          setTokenState(t);
        }}
      />
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <a href="#/" className="brand">
          shortDrama Admin
        </a>
        <button
          className="link"
          onClick={() => {
            setToken(null);
            setTokenState(null);
          }}>
          Sign out
        </button>
      </header>
      <main className="page">
        {route.screen === 'series' ? <SeriesEditor id={route.id} /> : <SeriesList />}
      </main>
    </div>
  );
}

function SignIn({ onSignIn }: { onSignIn: (token: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <main className="signin">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSignIn(value.trim());
        }}>
        <h1>shortDrama Admin</h1>
        <p className="muted">Paste the admin token from the API's environment.</p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Admin token"
          autoFocus
        />
        <button type="submit" className="primary">
          Sign in
        </button>
      </form>
    </main>
  );
}
