const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { openDb, createRepo } = require('../src/db');
const { createApp } = require('../src/app');
const { normaliseUrl } = require('../src/validate');

let server, base;
before(async () => {
  server = createApp(createRepo(openDb(':memory:')));
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const post = (body) => fetch(`${base}/api/coverage`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const clip = (over = {}) => ({
  outlet: 'The Hindu', headline: 'New phone launches in India', url: 'https://thehindu.com/tech/phone-launch',
  published: '2026-10-01', tier: 1, sentiment: 'positive', campaign: 'Diwali launch', ...over,
});

test('normaliseUrl strips tracking params, www, fragments and trailing slashes', () => {
  assert.equal(
    normaliseUrl('https://www.Example.com/a/b/?utm_source=x&id=2&fbclid=y#top'),
    normaliseUrl('https://example.com/a/b?id=2'),
  );
  assert.notEqual(normaliseUrl('https://example.com/a?id=1'), normaliseUrl('https://example.com/a?id=2'));
});

test('creates a clip and returns it', async () => {
  const res = await post(clip());
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.outlet, 'The Hindu');
  assert.equal(body.tier, 1);
});

test('rejects the same article logged twice, even with tracking params', async () => {
  const res = await post(clip({ url: 'https://www.thehindu.com/tech/phone-launch/?utm_source=twitter' }));
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.existing.outlet, 'The Hindu');
});

test('returns field-level errors for bad input', async () => {
  const res = await post({ outlet: '', url: 'not a url', published: '2999-01-01', tier: 7, sentiment: 'meh' });
  assert.equal(res.status, 422);
  const { fields } = await res.json();
  for (const f of ['outlet', 'headline', 'url', 'published', 'tier', 'sentiment']) assert.ok(fields[f], `missing ${f} error`);
});

test('rejects malformed JSON with 400, not 500', async () => {
  const res = await fetch(`${base}/api/coverage`, { method: 'POST', body: '{oops' });
  assert.equal(res.status, 400);
});

test('lists and filters clips', async () => {
  await post(clip({ url: 'https://ndtv.com/x', outlet: 'NDTV', headline: 'Review: battery is weak', sentiment: 'negative', tier: 2 }));
  await post(clip({ url: 'https://blog.example/y', outlet: 'Some Blog', headline: 'Hands-on', tier: 3, campaign: null }));

  const all = await (await fetch(`${base}/api/coverage`)).json();
  assert.equal(all.total, 3);

  const neg = await (await fetch(`${base}/api/coverage?sentiment=negative`)).json();
  assert.deepEqual(neg.items.map((c) => c.outlet), ['NDTV']);

  const search = await (await fetch(`${base}/api/coverage?q=battery`)).json();
  assert.equal(search.total, 1);
});

test('summary counts by tier and sentiment', async () => {
  const s = await (await fetch(`${base}/api/summary`)).json();
  assert.equal(s.total, 3);
  assert.equal(s.byTier[1], 1);
  assert.equal(s.bySentiment.negative, 1);
  assert.deepEqual(s.campaigns, ['Diwali launch']);

  const scoped = await (await fetch(`${base}/api/summary?campaign=Diwali%20launch`)).json();
  assert.equal(scoped.total, 2);
});

test('deletes a clip, then 404s on a second delete', async () => {
  const created = await (await post(clip({ url: 'https://example.com/delete-me' }))).json();
  assert.equal((await fetch(`${base}/api/coverage/${created.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await fetch(`${base}/api/coverage/${created.id}`, { method: 'DELETE' })).status, 404);
});

test('serves the web UI and blocks path traversal', async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Clipping/);
  const sneaky = await fetch(`${base}/..%2fpackage.json`);
  assert.notEqual(sneaky.status, 200);
});
