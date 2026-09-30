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
      <GrantCoins />
    </>
  );
}

// Support tool: coins for a viewer (goodwill, contest prizes, testing). The viewer ID is shown on
// the Profile tab in the app. Recorded in the ledger as an adjustment.
function GrantCoins() {
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('100');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  return (
    <form
      className="card"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);
        try {
          const result = await adminApi.grantCoins(userId.trim(), Number(amount));
          setMessage({ error: false, text: `Done. The viewer now has ${result.coins} coins.` });
        } catch (err) {
          setMessage({ error: true, text: describeError(err) });
        }
      }}>
      <h2>Give coins</h2>
      <div className="row">
        <label>
          Viewer ID (from the app's Profile tab)
          <input value={userId} onChange={(e) => setUserId(e.target.value)} required />
        </label>
        <label>
          Coins (negative takes coins back)
          <input
            type="number"
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>
      </div>
      {message && <p className={message.error ? 'error' : 'success'}>{message.text}</p>}
      <button type="submit" className="primary">
        Give coins
      </button>
    </form>
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
