import { useState } from 'react';

import { adminApi, uploadToStream } from './api';
import { describeError } from './useLoad';

// Basic uploads accept up to 200 MB; resumable (tus) uploads for bigger files come later.
const MAX_BYTES = 200 * 1024 * 1024;
const PARALLEL = 3;

type Item = {
  file: File;
  episode: number | null;
  progress: number;
  state: 'waiting' | 'uploading' | 'done' | 'failed';
  error?: string;
};

// "EP01.mp4", "ep 12 final.mov", "Episode_3.mp4" → 1, 12, 3.
export function episodeNumberFromName(name: string): number | null {
  // Drop the extension first, or the "4" in ".mp4" reads as an episode number.
  const base = name.replace(/\.[^.]+$/, '');
  const match = /ep(?:isode)?[\s_-]*0*(\d+)/i.exec(base) ?? /^\D*0*(\d+)\D*$/.exec(base);
  const n = match ? Number(match[1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function EpisodeUploader({
  seriesId,
  onUploaded,
}: {
  seriesId: string;
  onUploaded: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = items.some((i) => i.state === 'uploading');

  const patch = (index: number, change: Partial<Item>) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)));

  const start = async (files: File[]) => {
    const queued: Item[] = files
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((file) => {
        const episode = episodeNumberFromName(file.name);
        if (file.size > MAX_BYTES) {
          return { file, episode, progress: 0, state: 'failed', error: 'over 200 MB' };
        }
        if (!episode) {
          return {
            file,
            episode,
            progress: 0,
            state: 'failed',
            error: 'no episode number in name',
          };
        }
        return { file, episode, progress: 0, state: 'waiting' };
      });
    setItems(queued);

    let next = 0;
    const worker = async () => {
      while (next < queued.length) {
        const index = next++;
        const item = queued[index];
        if (item.state !== 'waiting' || item.episode == null) continue;
        patch(index, { state: 'uploading' });
        try {
          const { uploadUrl } = await adminApi.createUpload(seriesId, item.episode);
          await uploadToStream(uploadUrl, item.file, (progress) => patch(index, { progress }));
          patch(index, { state: 'done', progress: 1 });
        } catch (err) {
          patch(index, { state: 'failed', error: describeError(err) });
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    onUploaded();
  };

  return (
    <div>
      <label
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!busy) start(Array.from(e.dataTransfer.files));
        }}>
        <input
          type="file"
          accept="video/*"
          multiple
          disabled={busy}
          onChange={(e) => {
            if (e.target.files) start(Array.from(e.target.files));
            e.target.value = '';
          }}
        />
        <strong>Drop episode files here</strong> or click to choose. Name them EP01.mp4, EP02.mp4,
        and so on; each file becomes that episode, replacing any earlier upload.
      </label>
      {items.length > 0 && (
        <ul className="uploads">
          {items.map((item, i) => (
            <li key={item.file.name + i} className={`upload-${item.state}`}>
              <span>
                {item.episode ? `EP ${item.episode}` : '—'} · {item.file.name}
              </span>
              <span>
                {item.state === 'uploading' && `${Math.round(item.progress * 100)}%`}
                {item.state === 'waiting' && 'waiting'}
                {item.state === 'done' && 'uploaded'}
                {item.state === 'failed' && `failed: ${item.error}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
