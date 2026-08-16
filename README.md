# Prep Coach

Multi-user meal-prep planner with a weekly **calorie bank**: plan recipes and staples
for the week, review a shopping list item-by-item (Need it / Have it), track what you
actually eat, and talk to an AI coach that only knows what *you* told it.

Built to `PROJECT_SPEC.md` (v2). The v1 single-user Python app lives in git history
(`git tag v1`).

## Core ideas

- **Zero seeded data.** Every account starts empty: no pantry list, no staples,
  no default targets. Whatever number the app was first built around belonged
  to one person — onboarding *suggests* a bank from your own vitals
  (Mifflin-St Jeor) and you drag a slider to whatever you'll actually stick to.
- **The user decides everything on the shopping list.** No automated
  "you probably have salt so we removed it." Items are only *sorted* so likely
  buys come first; you tap Need or Have on each one.
- **Bank over days.** Easy to overeat one day, hard to overeat a week you
  planned and bought. The bank meter shows planned kcal vs your weekly target;
  the Track page shows spent kcal vs the same bank.
- **Weeks are snapshots.** A week copies your targets at creation, and list
  items / week staples are value copies — finishing a week freezes it forever.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind v4 + shadcn/ui · Prisma 7 +
PostgreSQL · better-auth (email/password) · Anthropic API (`claude-sonnet-4-6`)
for recipe parsing, food estimates, and the coach.

## Run it locally

You need Node 20+ (this machine uses nvm) and Postgres
([Postgres.app](https://postgresapp.com) — open it, click Initialize).

```bash
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY; set DATABASE_URL user to your macOS username
npx prisma migrate dev # creates/updates the local database
npm run dev            # http://localhost:3000
```

Useful commands:

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npx prisma studio` | GUI to inspect the database |
| `npx prisma migrate dev --name x` | After editing `prisma/schema.prisma` |
| `npm test` | Unit tests for the pure logic (shopping merge, bank math, BMR) |

## Where things live

```
prisma/schema.prisma      the entire data model, one readable file
src/lib/
  targets.ts              BMR → suggested weekly bank (pure, tested)
  shopping.ts             merge/sort/group/export list logic (pure, tested)
  weekmath.ts             bank + protein math (pure, tested)
  claude/                 the three AI calls: parse-recipe, coach, estimate-food
  auth.ts, session.ts     better-auth config + requireUser()
  db.ts                   Prisma client singleton
src/actions/              server actions (all mutations; every one calls requireUser)
src/app/(app)/            the app pages: week, week/list, week/track, week/chat,
                          cookbook, ingest, staples, profile, weeks
src/app/onboarding/       goal → vitals → bank-slider wizard
src/components/           React components (ui/ = shadcn primitives)
```

## Python-to-JS translation table (for the owner)

| Python habit | Here |
|---|---|
| `pip install` / requirements.txt | `npm install` / package.json |
| venv | `node_modules/` (gitignored, recreated by npm install) |
| pydantic | Zod (`z.object(...)` in `src/lib/claude/*`) |
| alembic / migrate.py | `npx prisma migrate dev` |
| f-strings | template literals `` `${x}` `` |
| `sqlite3.connect()` per request | one shared Prisma client (`src/lib/db.ts`) |

Two Next.js concepts worth knowing:

1. **Server vs client components.** Pages fetch data on the server. Any file
   starting with `"use client"` runs in the browser (state, clicks). If you see
   "useState only works in a Client Component," add that directive or move the
   interactive bit to its own small client file.
2. **Two-layer auth.** `src/middleware.ts` only checks a cookie *exists* (fast
   redirect UX). The real gate is `requireUser()` at the top of every page and
   server action. Don't remove either.

Security notes: secrets never get a `NEXT_PUBLIC_` prefix; files that touch the
API key or DB import `"server-only"` so accidentally importing them from browser
code fails the build; server actions never trust IDs from the client without
checking the row belongs to the session user.

## Deploy to Railway

Two routes. The CLI one needs no GitHub account; the GitHub one gets you
auto-deploy on every push. You can start with the CLI and add GitHub later.

### A. Straight from this folder (Railway CLI)

```bash
railway login                       # opens a browser
railway init                        # creates the project
railway add --database postgres     # Postgres in the same project
railway up                          # builds and deploys this directory
```

Then set the service variables (Railway dashboard → your service → Variables):

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — a reference, typed literally |
| `ANTHROPIC_API_KEY` | your key; every user's AI calls bill to it |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `https://<your-domain>` — the domain from the next step |

Finally, Settings → Networking → **Generate Domain**, put that URL into
`BETTER_AUTH_URL`, and redeploy. Log-in breaks if that variable is wrong or
missing, so it's the one to double-check.

### B. GitHub (auto-deploy on push)

Create an empty repo on github.com, then:

```bash
git remote add origin https://github.com/<you>/prepcoach.git
git push -u origin main
```

In Railway: **New Project → Deploy from GitHub repo**, add PostgreSQL to the
same project, and set the same variables as above.

### Notes

- `npm start` runs `prisma migrate deploy` before booting, so schema changes
  ship themselves on every deploy. No volume needed — Postgres is the
  persistence story.
- Local data does **not** come along. Production starts empty; sign up fresh.
- `.env` is gitignored and excluded from `railway up`. Secrets only ever live
  in Railway's Variables tab.
- Signup is open to anyone with the URL. If it travels further than intended,
  the cheapest fixes are an invite-code check on signup, an `ALLOW_SIGNUPS`
  env flag, or a per-user daily cap on AI calls.
