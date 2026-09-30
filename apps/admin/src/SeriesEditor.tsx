import type { AdminSeries, AdminSeriesPatch, PublishStatus } from '@shortdrama/shared';
import { useState } from 'react';

import { adminApi } from './api';
import { EpisodeUploader } from './EpisodeUploader';
import { describeError, useLoad } from './useLoad';

export function SeriesEditor({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => adminApi.getSeries(id));

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;
  const { series, publishProblems } = data;

  return (
    <>
      <div className="page-head">
        <a href="#/" className="muted">
          ← All series
        </a>
        <h1>{series.title}</h1>
        <span className={`badge badge-${series.status}`}>{series.status}</span>
      </div>
      <div className="columns">
        <DetailsForm key={series.id + series.title} series={series} onSaved={reload} />
        <PublishPanel series={series} problems={publishProblems} onChanged={reload} />
      </div>
      <Episodes series={series} onChanged={reload} />
    </>
  );
}

function DetailsForm({ series, onSaved }: { series: AdminSeries; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: series.title,
    synopsis: series.synopsis,
    freeEpisodes: String(series.freeEpisodes),
    coinPrice: String(series.coinPrice),
    coverUrl: series.coverUrl ?? '',
    bannerUrl: series.bannerUrl ?? '',
  });
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [key]: e.target.value });

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        const patch: AdminSeriesPatch = {
          title: form.title.trim(),
          synopsis: form.synopsis.trim(),
          freeEpisodes: Number(form.freeEpisodes),
          coinPrice: Number(form.coinPrice),
          ...(form.coverUrl.trim() ? { coverUrl: form.coverUrl.trim() } : {}),
          ...(form.bannerUrl.trim() ? { bannerUrl: form.bannerUrl.trim() } : {}),
        };
        try {
          await adminApi.updateSeries(series.id, patch);
          setMessage({ error: false, text: 'Saved.' });
          onSaved();
        } catch (err) {
          setMessage({ error: true, text: describeError(err) });
        }
      }}>
      <h2>Details</h2>
      <label>
        Title
        <input value={form.title} onChange={set('title')} required />
      </label>
      <label>
        Synopsis
        <textarea value={form.synopsis} onChange={set('synopsis')} rows={4} />
      </label>
      <div className="row">
        <label>
          Free episodes
          <input type="number" min={0} value={form.freeEpisodes} onChange={set('freeEpisodes')} />
        </label>
        <label>
          Coins per locked episode
          <input type="number" min={0} value={form.coinPrice} onChange={set('coinPrice')} />
        </label>
      </div>
      {/* Image uploads to R2 come later; for now paste a hosted image URL. */}
      <label>
        Cover image URL (vertical 3:4)
        <input type="url" value={form.coverUrl} onChange={set('coverUrl')} />
      </label>
      <label>
        Banner image URL (wide)
        <input type="url" value={form.bannerUrl} onChange={set('bannerUrl')} />
      </label>
      {message && <p className={message.error ? 'error' : 'success'}>{message.text}</p>}
      <button type="submit" className="primary">
        Save details
      </button>
    </form>
  );
}

function PublishPanel({
  series,
  problems,
  onChanged,
}: {
  series: AdminSeries;
  problems: string[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const setStatus = async (status: PublishStatus) => {
    setError(null);
    try {
      await adminApi.updateSeries(series.id, { status });
      onChanged();
    } catch (err) {
      setError(describeError(err));
    }
  };
  const live = series.status === 'published';

  return (
    <section className="card">
      <h2>Publishing</h2>
      {live ? (
        <p>Live in the app.</p>
      ) : problems.length ? (
        <>
          <p>Before this series can go live it:</p>
          <ul className="problems">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      ) : (
        <p>Ready to publish.</p>
      )}
      {error && <p className="error">{error}</p>}
      {live ? (
        <button onClick={() => setStatus('unpublished')}>Unpublish</button>
      ) : (
        <button
          className="primary"
          disabled={problems.length > 0}
          onClick={() => setStatus('published')}>
          Publish now
        </button>
      )}
    </section>
  );
}

function Episodes({ series, onChanged }: { series: AdminSeries; onChanged: () => void }) {
  return (
    <section className="card">
      <h2>Episodes ({series.episodes.length})</h2>
      <EpisodeUploader seriesId={series.id} onUploaded={onChanged} />
      {series.episodes.length > 0 && (
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Status</th>
              <th>Video</th>
              <th>New upload</th>
              <th className="num">Length</th>
            </tr>
          </thead>
          <tbody>
            {series.episodes.map((e) => (
              <tr key={e.id}>
                <td className="num">{e.number}</td>
                <td>
                  <span className={`badge badge-${e.status}`}>{e.status}</span>
                </td>
                <td>{e.videoStatus ?? <span className="muted">none</span>}</td>
                <td>{e.pendingVideoStatus ?? <span className="muted">none</span>}</td>
                <td className="num">
                  {e.durationSeconds ? `${Math.round(Number(e.durationSeconds))} s` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">
        Cloudflare converts each upload in a minute or two; reload the page to see it turn ready.
      </p>
    </section>
  );
}
