# CLAUDE.md

Instructions for Claude Code working in this repo.

## What this is

Prep Coach: a multi-user meal-prep planner and food diary built around a
**weekly calorie bank** — easy to overeat a day, hard to overeat a week you
planned, bought, and are watching. Users plan weeks of recipes, review a
shopping list item by item, track what they actually eat, weigh in, and watch
weekly wins stack toward a goal weight.

- **Dev**: this machine, `http://localhost:3000`, kept alive by a launchd
  agent (`com.prepcoach`) — never start a second server; logs at
  `~/Library/Logs/prepcoach.log`. Postgres runs in Postgres.app.
- **Production**: Railway, deployed from GitHub. `git push` IS the release
  process; the `start` script runs `prisma migrate deploy` first, so
  migrations ship themselves.

## Note: Next.js here is newer than your training data

APIs, conventions, and file structure may differ from what you know. Read the
relevant guide in `node_modules/next/dist/docs/` before writing non-trivial
framework code. Heed deprecation notices.

## Principles (the product's spine — v1 died for violating them)

- **Zero seeded data, zero builder assumptions.** A new account is empty:
  no staples, no pantry guesses, no default targets. If a feature needs a
  number, the user supplies it or the app derives it from THEIR inputs.
- **The user owns every number.** The app suggests (calorie bank, protein
  range, maintenance) and shows the math behind the suggestion; the user
  confirms, drags, or overrides. Nothing auto-saves a judgment call. The one
  sanctioned automation: maintenance may follow the scale and diary, but the
  bank never moves on its own.
- **A plan is just a plan.** The diary (`FoodLogEntry`) and weigh-ins
  (`WeightEntry`) belong to the user and a date — never to a week. Weeks read
  them by date range. Tracking must work with no week planned at all.
- **Unlogged days are unknown, never zero.** Refuse to score (win/loss,
  implied maintenance) rather than guess. Coverage guards live in the lib
  functions; keep them there.
- **Instructional copy lives in tooltips** (`InfoTip`), not crammed inline.

## Architecture map

- `src/app/` — pages. Server components fetch and display; no writes.
- `src/actions/` — server actions; every DB write lives here, and every one
  starts with `requireUser()`. That call is the security boundary
  (`middleware`/proxy is cosmetic UX only). `userId` NEVER comes from the
  client; child rows verify parent ownership.
- `src/lib/` — pure math (`energy.ts`, `progress.ts`, `weeks.ts`,
  `weekmath.ts`, `shopping.ts`, `targets.ts`), unit-tested with vitest.
  **New arithmetic goes here with tests first**, then gets wired to a page.
- `src/lib/claude/` — the three Anthropic calls (recipe parse, food estimate,
  coach), all `server-only`, all strict-JSON + Zod with typed error chains
  that return friendly `{ok:false, error}` — a failed parse must never lose
  the user's paste.
- `src/components/` — UI. Charts are plain CSS/SVG, no chart library.

## Hard invariants

1. kcal and grams are INTEGER; weights may be Float (scales read tenths).
2. Dates are `YYYY-MM-DD` handled at UTC midnight; `@db.Date` columns.
   `calendarWeekStart`/`addDays` in `lib/weeks.ts` are the only date walkers.
3. Every query is scoped to the session user.
4. Open weeks follow the profile's targets; a week's numbers freeze when it
   reaches `done`. List items and week staples are value copies — editing a
   recipe later never rewrites a finished week.
5. Diary and weight entries upsert per (user, date) where duplication would
   lie (weigh-ins); ingest is safe to retry.
6. Migrations are hand-written SQL in `prisma/migrations/` (numbered folders).
   `prisma migrate dev` needs a TTY and fails here — write the SQL, apply with
   `migrate deploy`, then `prisma generate` and restart matters (stale client
   = phantom type errors).

## Never do

- Never commit secrets. `.env` is gitignored and holds `DATABASE_URL`,
  `ANTHROPIC_API_KEY`, `BETTER_AUTH_SECRET`. Never print, log, or echo them.
- Never DELETE diary or weight history; short of a user-initiated entry
  delete, those tables only grow.
- Never seed data into any account, including test accounts on shared DBs.
- Never `git push` without being asked — a push deploys to production.
- Real user data stays out of tests and fixtures; tests run on synthetic
  numbers only.

## Working style

Owner is a beginner coder, learning by reading the diffs. Explain approaches
in prose before large changes; keep diffs small; comment the *why*; state
assumptions out loud. When a task seems to need a stack change, stop and say
so instead of adding it.
