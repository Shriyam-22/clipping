# Clipping

A press coverage tracker for PR teams. Log a clip (link, headline, outlet, tier, sentiment, campaign), filter and search what has landed, and see the tier and sentiment split at a glance.

I built it because during a launch, coverage tracking usually lives in a shared spreadsheet that fills up with the same article pasted twice, broken links and no quick read on how the launch is landing.

**Live demo:** _add your deployed URL here_

## What it does

- **Log clips** with field-level validation and clear error messages.
- **Blocks duplicates**: the same article with `utm_` tracking, `www.`, a trailing slash or a `#fragment` is recognised as already logged, and the app shows you the existing entry.
- **Search and filter** by headline, outlet, campaign and sentiment.
- **Summary**: total clips, Tier 1 count, positive and negative share, scoped to a campaign.
- **Delete with Undo** instead of an "Are you sure?" dialog.
- Works on a phone first, with dark mode.

## Stack and layers

| Layer | What |
| --- | --- |
| Web client | Plain HTML, CSS and JavaScript, no build step (`public/`) |
| REST API | Node.js `http` server with a small router (`src/app.js`) |
| Database | SQLite through Node's built-in `node:sqlite` (`src/db.js`) |
| Tests | `node:test`, 9 API and validation tests (`test/`) |
| CI | GitHub Actions runs tests on every push and PR |

There are **zero npm dependencies**. Node 22.13 or newer is the only requirement.

## API

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/coverage?q=&campaign=&sentiment=&tier=&limit=&offset=` | Newest first, paginated |
| `POST` | `/api/coverage` | `201` created, `422` with per-field errors, `409` duplicate with the existing clip |
| `DELETE` | `/api/coverage/:id` | `204`, or `404` |
| `GET` | `/api/summary?campaign=` | Counts by tier, sentiment, top outlets, campaign list |
| `GET` | `/api/health` | For uptime checks |

## Run it

```bash
npm start      # http://localhost:3000
npm run dev    # restarts on file changes
npm test
```

`PORT` and `DB_FILE` can be set as environment variables.

## Deploy (Render, free tier)

1. Push this folder to a public GitHub repo.
2. On render.com, create a **Web Service** from the repo.
3. Build command: leave empty. Start command: `npm start`.
4. Free instances have no persistent disk, so the database resets when the service restarts. That's fine for a demo. For real use, attach a disk and set `DB_FILE` to a path on it.

## Product decisions and trade-offs

- **Duplicate detection by normalised URL, enforced in the database** (a `UNIQUE` column), so two fast submissions can't both get in. Trade-off: syndicated copies of the same story on different domains still count as separate clips, which is arguably right for reach.
- **Undo rather than a confirm dialog.** Deleting is fast, and a mistake is recoverable. Trade-off: undo restores the clip with a new ID.
- **The form remembers campaign, tier and date after saving**, because people tend to log several clips from the same launch in a row.
- **Dates use the user's local day, not UTC.** In India, UTC still reads as "yesterday" until 5:30am, which would have blocked logging today's coverage.
- **SQLite, not Postgres.** One file, no server to run, and plenty for a single team. It would be the first thing to change for multiple teams.
- **No framework.** It keeps the project small and readable, at the cost of re-implementing routing and body parsing.

## What I'd build next

1. Paste a link and auto-fill headline and outlet from the page's metadata.
2. Accounts, so each team sees its own coverage.
3. CSV export for weekly reports.
4. Reach and estimated readership per outlet, for a weighted share of voice.

## How it was built

Built with Claude Code as a coding partner. I reviewed and tested every part, and I can walk through any of it.
