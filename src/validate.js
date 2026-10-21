// Input validation + URL normalisation. Pure functions, easy to unit test.

const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|ref$|ref_src$|mc_)/i;

// Two links to the same article often differ only by tracking params, "www.",
// a trailing slash or a #fragment. Normalise so we can catch duplicates.
function normaliseUrl(raw) {
  const u = new URL(raw);
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  }
  u.searchParams.sort();
  let path = u.pathname.replace(/\/+$/, '') || '/';
  return `${u.hostname}${path}${u.search}`;
}

function validateCoverage(body) {
  const errors = {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');

  const outlet = s(body.outlet);
  const headline = s(body.headline);
  const url = s(body.url);
  const published = s(body.published);
  const sentiment = s(body.sentiment).toLowerCase();
  const campaign = s(body.campaign) || null;
  const tier = Number(body.tier);

  if (!outlet) errors.outlet = 'Outlet is required';
  else if (outlet.length > 120) errors.outlet = 'Outlet is too long';

  if (!headline) errors.headline = 'Headline is required';
  else if (headline.length > 300) errors.headline = 'Headline is too long';

  let url_key = null;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    url_key = normaliseUrl(url);
  } catch {
    errors.url = 'Enter a full link starting with http:// or https://';
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(published) || Number.isNaN(Date.parse(published))) {
    errors.published = 'Use a valid date (YYYY-MM-DD)';
  } else if (published > new Date(Date.now() + 14 * 3600e3).toISOString().slice(0, 10)) {
    // +14h covers the furthest-ahead timezone, so a user's "today" is never rejected
    errors.published = 'Publish date can’t be in the future';
  }

  if (![1, 2, 3].includes(tier)) errors.tier = 'Tier must be 1, 2 or 3';
  if (!['positive', 'neutral', 'negative'].includes(sentiment)) errors.sentiment = 'Pick a sentiment';
  if (campaign && campaign.length > 60) errors.campaign = 'Campaign name is too long';

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { outlet, headline, url, url_key, published, tier, sentiment, campaign } };
}

module.exports = { normaliseUrl, validateCoverage };
