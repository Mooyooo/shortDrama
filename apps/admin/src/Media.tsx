import type { AdminEpisode, AdminSeries } from '@shortdrama/shared';
import { useState } from 'react';

import { adminApi, uploadToStream } from './api';
import { describeError } from './useLoad';

// Cloudflare Images accepts files up to 10 MB.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TRAILER_BYTES = 200 * 1024 * 1024;

type Upload = { progress: number } | { error: string } | null;

function UploadState({ state }: { state: Upload }) {
  if (!state) return null;
  if ('error' in state) return <p className="error">{state.error}</p>;
  return <p className="muted small">Uploading… {Math.round(state.progress * 100)}%</p>;
}

// Cover (vertical 3:4, shown on posters) and banner (wide, the Discover carousel).
// Uploading saves the new address on the series straight away.
export function ArtworkCard({ series, onChanged }: { series: AdminSeries; onChanged: () => void }) {
  return (
    <section className="card">
      <h2>Artwork</h2>
      <div className="artwork">
        <ImageField
          label="Cover"
          hint="Vertical 3:4, e.g. 900 × 1200"
          url={series.coverUrl}
          shape="cover"
          onUploaded={(coverUrl) => adminApi.updateSeries(series.id, { coverUrl }).then(onChanged)}
        />
        <ImageField
          label="Banner"
          hint="Wide 16:9, e.g. 1600 × 900"
          url={series.bannerUrl}
          shape="banner"
          onUploaded={(bannerUrl) =>
            adminApi.updateSeries(series.id, { bannerUrl }).then(onChanged)
          }
        />
      </div>
    </section>
  );
}

function ImageField({
  label,
  hint,
  url,
  shape,
  onUploaded,
}: {
  label: string;
  hint: string;
  url: string | null;
  shape: 'cover' | 'banner';
  onUploaded: (deliveryUrl: string) => Promise<unknown>;
}) {
  const [state, setState] = useState<Upload>(null);

  const upload = async (file: File) => {
    if (file.size > MAX_IMAGE_BYTES) {
      setState({ error: 'Images can be up to 10 MB.' });
      return;
    }
    setState({ progress: 0 });
    try {
      const { uploadUrl, deliveryUrl } = await adminApi.createImageUpload();
      await uploadToStream(uploadUrl, file, (progress) => setState({ progress }));
      await onUploaded(deliveryUrl);
      setState(null);
    } catch (err) {
      setState({ error: describeError(err) });
    }
  };

  return (
    <div className="image-field">
      <div className={`preview preview-${shape}`}>
        {url ? (
          <img src={url} alt={`${label} image`} />
        ) : (
          <span className="muted small">No {label.toLowerCase()} yet</span>
        )}
      </div>
      <strong>{label}</strong>
      <span className="muted small">{hint}</span>
      <label className="button-like">
        {url ? 'Replace' : 'Upload'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          disabled={state !== null && 'progress' in state}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = '';
          }}
        />
      </label>
      <UploadState state={state} />
    </div>
  );
}

// The clip the For You feed and the series page play. It shows in the app once Cloudflare has
// converted it (a minute or two).
export function TrailerCard({ series, onChanged }: { series: AdminSeries; onChanged: () => void }) {
  const [state, setState] = useState<Upload>(null);

  const upload = async (file: File) => {
    if (file.size > MAX_TRAILER_BYTES) {
      setState({ error: 'Trailers can be up to 200 MB.' });
      return;
    }
    setState({ progress: 0 });
    try {
      const { uploadUrl } = await adminApi.createTrailerUpload(series.id);
      await uploadToStream(uploadUrl, file, (progress) => setState({ progress }));
      setState(null);
      onChanged();
    } catch (err) {
      setState({ error: describeError(err) });
    }
  };

  const status = series.trailerStatus;
  return (
    <section className="card">
      <h2>Trailer</h2>
      <p>
        {status === 'ready'
          ? 'Ready: plays in the For You feed and on the series page.'
          : status
            ? `Uploaded, ${status}. It appears once Cloudflare finishes converting it; reload to check.`
            : 'No trailer yet. The app shows the cover instead.'}
      </p>
      <p className="muted small">Vertical 9:16, 30–90 seconds, up to 200 MB.</p>
      <label className="button-like">
        {status ? 'Replace trailer' : 'Upload trailer'}
        <input
          type="file"
          accept="video/*"
          hidden
          disabled={state !== null && 'progress' in state}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = '';
          }}
        />
      </label>
      <UploadState state={state} />
    </section>
  );
}

// One table cell: the episode's subtitle languages, with remove and add.
export function SubtitlesCell({
  episode,
  onChanged,
}: {
  episode: AdminEpisode;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      onChanged();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const add = async (file: File) => {
    const text = await file.text();
    const guess = /[._-]([a-z]{2}(?:-[A-Z]{2})?)\.vtt$/.exec(file.name)?.[1] ?? 'en';
    const language = window.prompt('Subtitle language code (en, es, pt-BR…)', guess)?.trim();
    if (!language) return;
    run(() => adminApi.putSubtitles(episode.id, language, text));
  };

  if (episode.videoStatus !== 'ready') return <span className="muted small">after video</span>;

  return (
    <div className="subtitles">
      {episode.subtitles.map((language) => (
        <span key={language} className="badge">
          {language}{' '}
          <button
            className="link"
            disabled={busy}
            aria-label={`Remove ${language} subtitles`}
            onClick={() => {
              if (
                window.confirm(`Remove the ${language} subtitles from episode ${episode.number}?`)
              ) {
                run(() => adminApi.deleteSubtitles(episode.id, language));
              }
            }}>
            ×
          </button>
        </span>
      ))}
      <label className="link small">
        + .vtt
        <input
          type="file"
          accept=".vtt,text/vtt"
          hidden
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) add(file);
            e.target.value = '';
          }}
        />
      </label>
      {error && <span className="error small">{error}</span>}
    </div>
  );
}
