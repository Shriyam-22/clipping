// Data layer: SQLite via Node's built-in driver (no ORM, no native build step).
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS coverage (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet      TEXT    NOT NULL,
  headline    TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  url_key     TEXT    NOT NULL UNIQUE,   -- normalised URL, blocks duplicate logging
  published   TEXT    NOT NULL,          -- YYYY-MM-DD
  tier        INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
  sentiment   TEXT    NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  campaign    TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coverage_published ON coverage (published DESC);
CREATE INDEX IF NOT EXISTS idx_coverage_campaign  ON coverage (campaign);
`;

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

function createRepo(db) {
  const insert = db.prepare(`
    INSERT INTO coverage (outlet, headline, url, url_key, published, tier, sentiment, campaign)
    VALUES (:outlet, :headline, :url, :url_key, :published, :tier, :sentiment, :campaign)`);
  const byId = db.prepare('SELECT * FROM coverage WHERE id = ?');
  const byKey = db.prepare('SELECT * FROM coverage WHERE url_key = ?');
  const del = db.prepare('DELETE FROM coverage WHERE id = ?');

  return {
    findByUrlKey: (key) => byKey.get(key),

    create(item) {
      const { lastInsertRowid } = insert.run(item);
      return byId.get(lastInsertRowid);
    },

    remove: (id) => del.run(id).changes > 0,

    list({ campaign, tier, sentiment, q, limit = 50, offset = 0 } = {}) {
      const where = [];
      const params = {};
      if (campaign) { where.push('campaign = :campaign'); params.campaign = campaign; }
      if (tier) { where.push('tier = :tier'); params.tier = tier; }
      if (sentiment) { where.push('sentiment = :sentiment'); params.sentiment = sentiment; }
      if (q) { where.push('(headline LIKE :q OR outlet LIKE :q)'); params.q = `%${q}%`; }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const items = db
        .prepare(`SELECT * FROM coverage ${clause} ORDER BY published DESC, id DESC LIMIT :limit OFFSET :offset`)
        .all({ ...params, limit, offset });
      const { total } = db.prepare(`SELECT COUNT(*) AS total FROM coverage ${clause}`).get(params);
      return { items, total };
    },

    summary({ campaign } = {}) {
      const clause = campaign ? 'WHERE campaign = :campaign' : '';
      const params = campaign ? { campaign } : {};
      const rows = (sql) => db.prepare(sql).all(params);
      const total = db.prepare(`SELECT COUNT(*) AS n FROM coverage ${clause}`).get(params).n;
      const byTier = Object.fromEntries(
        rows(`SELECT tier, COUNT(*) AS n FROM coverage ${clause} GROUP BY tier`).map((r) => [r.tier, r.n]));
      const bySentiment = Object.fromEntries(
        rows(`SELECT sentiment, COUNT(*) AS n FROM coverage ${clause} GROUP BY sentiment`).map((r) => [r.sentiment, r.n]));
      const topOutlets = rows(
        `SELECT outlet, COUNT(*) AS n FROM coverage ${clause} GROUP BY outlet ORDER BY n DESC, outlet LIMIT 5`);
      const campaigns = db
        .prepare(`SELECT DISTINCT campaign FROM coverage WHERE campaign IS NOT NULL ORDER BY campaign`)
        .all().map((r) => r.campaign);
      return { total, byTier, bySentiment, topOutlets, campaigns };
    },
  };
}

module.exports = { openDb, createRepo };
