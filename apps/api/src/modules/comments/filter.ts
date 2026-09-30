import { englishDataset, englishRecommendedTransformers, RegExpMatcher } from 'obscenity';

// Checks run before a comment is saved. They catch the obvious cases; reports and staff review
// (the admin's moderation page) handle the rest.

const profanity = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

// Links and handles are how comment spam works ("free coins at ...", "DM me on ...").
const LINK =
  /(https?:\/\/|www\.|\bt\.me\/|\b[\w-]+\.(com|net|org|io|app|tv|me|ly|xyz|link|shop)\b)/i;

export const MAX_COMMENT_LENGTH = 500;

export type FilterResult =
  { ok: true; body: string } | { ok: false; reason: 'empty' | 'too_long' | 'profanity' | 'link' };

export function checkComment(raw: unknown): FilterResult {
  const body = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
  if (!body) return { ok: false, reason: 'empty' };
  if (body.length > MAX_COMMENT_LENGTH) return { ok: false, reason: 'too_long' };
  if (LINK.test(body)) return { ok: false, reason: 'link' };
  if (profanity.hasMatch(body)) return { ok: false, reason: 'profanity' };
  return { ok: true, body };
}
