import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ADMIN_TOKEN, freshDatabase, seedSeries, testApp } from './helpers.js';

let pool: pg.Pool;
let episodeId: string;
const admin = { Authorization: `Bearer ${ADMIN_TOKEN}` };

beforeAll(async () => {
  pool = await freshDatabase();
  ({
    episodeIds: [episodeId],
  } = await seedSeries(pool, { slug: 'comments', episodes: 1 }));
});

afterAll(() => pool.end());

async function viewer() {
  const res = await request(testApp(pool)).post('/v1/auth/guest').expect(201);
  return { id: res.body.viewer.id as string, auth: { Authorization: `Bearer ${res.body.token}` } };
}

const post = (auth: Record<string, string>, body: string) =>
  request(testApp(pool)).post(`/v1/episodes/${episodeId}/comments`).set(auth).send({ body });

const list = (auth: Record<string, string> = {}) =>
  request(testApp(pool)).get(`/v1/episodes/${episodeId}/comments`).set(auth).expect(200);

describe('posting and reading comments', () => {
  it('requires a viewer to post, and shows the comment with a default name', async () => {
    await request(testApp(pool))
      .post(`/v1/episodes/${episodeId}/comments`)
      .send({ body: 'hi' })
      .expect(401);
    const alice = await viewer();
    const res = await post(alice.auth, '  What a   twist!  ').expect(201);
    expect(res.body.comment).toMatchObject({ body: 'What a twist!', isMine: true });
    expect(res.body.comment.author.name).toBe(`Viewer ${alice.id.slice(0, 4)}`);

    const mine = await list(alice.auth);
    expect(mine.body.comments[0]).toMatchObject({ body: 'What a twist!', isMine: true });
    const anonymous = await list();
    expect(anonymous.body.comments[0].isMine).toBe(false);
  });

  it('filters profanity, links and empty text', async () => {
    const bob = await viewer();
    expect((await post(bob.auth, 'this is sh1t').expect(422)).body.error).toBe('profanity');
    expect((await post(bob.auth, 'free coins at www.scam.xyz').expect(422)).body.error).toBe(
      'link',
    );
    expect((await post(bob.auth, '   ').expect(422)).body.error).toBe('empty');
    expect((await post(bob.auth, 'x'.repeat(501)).expect(422)).body.error).toBe('too_long');
  });

  it('slows down repeats and floods', async () => {
    const carol = await viewer();
    await post(carol.auth, 'same thing').expect(201);
    await post(carol.auth, 'same thing').expect(429);
    for (let i = 0; i < 4; i++) await post(carol.auth, `message ${i}`).expect(201);
    await post(carol.auth, 'one too many').expect(429);
  });

  it('lets authors delete only their own comments', async () => {
    const author = await viewer();
    const other = await viewer();
    const { body } = await post(author.auth, 'delete me').expect(201);
    await request(testApp(pool))
      .delete(`/v1/comments/${body.comment.id}`)
      .set(other.auth)
      .expect(404);
    await request(testApp(pool))
      .delete(`/v1/comments/${body.comment.id}`)
      .set(author.auth)
      .expect(200);
    const all = await list();
    expect(all.body.comments.map((c: { id: string }) => c.id)).not.toContain(body.comment.id);
  });
});

describe('moderation', () => {
  it('hides a comment after three reports, and staff can restore it for good', async () => {
    const author = await viewer();
    const { body } = await post(author.auth, 'controversial take').expect(201);
    const id = body.comment.id;
    const report = (auth: Record<string, string>) =>
      request(testApp(pool)).post(`/v1/comments/${id}/report`).set(auth).send({ reason: 'abuse' });

    const reporter = await viewer();
    await report(reporter.auth).expect(200);
    await report(reporter.auth).expect(200); // the same viewer twice counts once
    await report((await viewer()).auth).expect(200);
    expect((await list()).body.comments.map((c: { id: string }) => c.id)).toContain(id);
    await report((await viewer()).auth).expect(200);
    expect((await list()).body.comments.map((c: { id: string }) => c.id)).not.toContain(id);

    const queue = await request(testApp(pool))
      .get('/v1/admin/comments/review')
      .set(admin)
      .expect(200);
    expect(queue.body.comments.find((c: { id: string }) => c.id === id)).toMatchObject({
      status: 'hidden',
      reportCount: 3,
      reasons: ['abuse'],
    });

    await request(testApp(pool))
      .post(`/v1/admin/comments/${id}/decision`)
      .set(admin)
      .send({ action: 'keep' })
      .expect(200);
    expect((await list()).body.comments.map((c: { id: string }) => c.id)).toContain(id);

    // A new report after the decision brings it back to the queue but doesn't hide it again.
    await report((await viewer()).auth).expect(200);
    expect((await list()).body.comments.map((c: { id: string }) => c.id)).toContain(id);
    const again = await request(testApp(pool))
      .get('/v1/admin/comments/review')
      .set(admin)
      .expect(200);
    expect(again.body.comments.map((c: { id: string }) => c.id)).toContain(id);
  });

  it("hides a blocked person's comments from the viewer who blocked them only", async () => {
    const troll = await viewer();
    const reader = await viewer();
    await post(troll.auth, 'annoying comment').expect(201);
    await request(testApp(pool)).post(`/v1/me/blocks/${troll.id}`).set(reader.auth).expect(200);
    const forReader = await list(reader.auth);
    expect(forReader.body.comments.map((c: { body: string }) => c.body)).not.toContain(
      'annoying comment',
    );
    const forOthers = await list();
    expect(forOthers.body.comments.map((c: { body: string }) => c.body)).toContain(
      'annoying comment',
    );
    await request(testApp(pool)).post(`/v1/me/blocks/${reader.id}`).set(reader.auth).expect(400);
  });

  it('bans a viewer: their comments go, and they can no longer post', async () => {
    const spammer = await viewer();
    await post(spammer.auth, 'buy followers').expect(201);
    await request(testApp(pool)).post(`/v1/admin/users/${spammer.id}/ban`).set(admin).expect(200);
    expect((await list()).body.comments.map((c: { body: string }) => c.body)).not.toContain(
      'buy followers',
    );
    expect((await post(spammer.auth, 'back again').expect(403)).body.error).toBe('banned');
  });

  it('removes comments with the account', async () => {
    const leaver = await viewer();
    await post(leaver.auth, 'goodbye').expect(201);
    await request(testApp(pool)).delete('/v1/me').set(leaver.auth).expect(200);
    const { rows } = await pool.query('SELECT 1 FROM comments WHERE user_id = $1', [leaver.id]);
    expect(rows).toHaveLength(0);
  });
});
