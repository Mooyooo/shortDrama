import { useState } from 'react';

import { adminApi } from './api';
import { describeError, useLoad } from './useLoad';

export function SeriesList() {
  const { data, error, reload } = useLoad(() => adminApi.listSeries());

  return (
    <>
      <div className="page-head">
        <h1>Series</h1>
      </div>
      {error && <p className="error">{error}</p>}
      {data && data.series.length === 0 && (
        <p className="muted">No series yet. Create the first one below.</p>
      )}
      {data && data.series.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
              <th className="num">Episodes</th>
              <th className="num">Free</th>
              <th className="num">Coins per episode</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {data.series.map((s) => (
              <tr key={s.id}>
                <td>
                  <a href={`#/series/${s.id}`}>{s.title}</a>
                  <div className="muted small">{s.slug}</div>
                </td>
                <td>
                  <span className={`badge badge-${s.status}`}>{s.status}</span>
                </td>
                <td className="num">{s.episodeCount}</td>
                <td className="num">{s.freeEpisodes}</td>
                <td className="num">{s.coinPrice}</td>
                <td>{new Date(s.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <CreateSeries
        onCreated={(id) => (window.location.hash = `#/series/${id}`)}
        onError={reload}
      />
    </>
  );
}

function slugify(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function CreateSeries({
  onCreated,
  onError,
}: {
  onCreated: (id: string) => void;
  onError: () => void;
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const { id } = await adminApi.createSeries({ title: title.trim(), slug });
          onCreated(id);
        } catch (err) {
          setError(describeError(err));
          onError();
        } finally {
          setBusy(false);
        }
      }}>
      <h2>New series</h2>
      <label>
        Title
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugEdited) setSlug(slugify(e.target.value));
          }}
          required
        />
      </label>
      <label>
        Slug (used in links; can't change later)
        <input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugEdited(true);
          }}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary" disabled={busy}>
        Create as draft
      </button>
    </form>
  );
}
