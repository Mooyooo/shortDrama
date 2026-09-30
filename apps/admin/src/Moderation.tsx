import type { ReviewComment } from '@shortdrama/shared';
import { useState } from 'react';

import { adminApi } from './api';
import { describeError, useLoad } from './useLoad';

// Reported comments, oldest first. Apple expects reports to be acted on promptly (within a day).
export function Moderation() {
  const { data, error, reload } = useLoad(() => adminApi.reviewComments());

  return (
    <>
      <div className="page-head">
        <h1>Moderation</h1>
        <button onClick={reload}>Refresh</button>
      </div>
      <p className="muted">
        Comments viewers reported. Three reports hide a comment until you decide. Banning a viewer
        removes all their comments and stops them posting; they can still watch.
      </p>
      {error && <p className="error">{error}</p>}
      {data && data.comments.length === 0 && <p className="success">Nothing to review.</p>}
      {data?.comments.map((comment) => (
        <ReviewCard key={comment.id} comment={comment} onDone={reload} />
      ))}
    </>
  );
}

function ReviewCard({ comment, onDone }: { comment: ReviewComment; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      onDone();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="card">
      <div className="review-meta">
        <span className={`badge badge-${comment.status === 'hidden' ? 'unpublished' : 'draft'}`}>
          {comment.status === 'hidden' ? 'hidden' : 'still visible'}
        </span>
        <span>
          {comment.reportCount} report{comment.reportCount === 1 ? '' : 's'}:{' '}
          {comment.reasons.join(', ')}
        </span>
        <span className="muted">
          {comment.episode.seriesTitle} · EP {comment.episode.number} ·{' '}
          {new Date(comment.createdAt).toLocaleString()}
        </span>
      </div>
      <blockquote className="review-body">{comment.body}</blockquote>
      <div className="muted small">
        by {comment.author.name}
        {comment.author.banned && ' (banned)'}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button
          disabled={busy}
          onClick={() => act(() => adminApi.decideComment(comment.id, 'keep'))}>
          Keep
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => act(() => adminApi.decideComment(comment.id, 'remove'))}>
          Remove
        </button>
        {comment.author.banned ? (
          <button disabled={busy} onClick={() => act(() => adminApi.unbanUser(comment.author.id))}>
            Unban author
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(`Ban ${comment.author.name}? All their comments will be removed.`)
              ) {
                act(() => adminApi.banUser(comment.author.id));
              }
            }}>
            Ban author
          </button>
        )}
      </div>
    </article>
  );
}
