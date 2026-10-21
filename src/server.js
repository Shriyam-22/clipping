const path = require('node:path');
const fs = require('node:fs');
const { openDb, createRepo } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'coverage.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const repo = createRepo(openDb(DB_FILE));
const server = createApp(repo, { log: (line) => console.log(new Date().toISOString(), line) });

server.listen(PORT, () => console.log(`Clipping running on http://localhost:${PORT}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
