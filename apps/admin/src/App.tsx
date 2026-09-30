import { useEffect, useState } from 'react';

import { getToken, setToken } from './api';
import { Moderation } from './Moderation';
import { SeriesEditor } from './SeriesEditor';
import { SeriesList } from './SeriesList';

// Three screens, addressed by the URL hash so the browser's back button works:
// #/ (series list), #/series/<id> (editor) and #/moderation (reported comments).
function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const match = /^#\/series\/([\w-]+)$/.exec(hash);
  if (match) return { screen: 'series' as const, id: match[1] };
  if (hash === '#/moderation') return { screen: 'moderation' as const };
  return { screen: 'list' as const };
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
        <nav className="nav">
          <a href="#/" className="brand">
            shortDrama Admin
          </a>
          <a href="#/">Series</a>
          <a href="#/moderation">Moderation</a>
        </nav>
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
        {route.screen === 'series' && <SeriesEditor id={route.id} />}
        {route.screen === 'moderation' && <Moderation />}
        {route.screen === 'list' && <SeriesList />}
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
