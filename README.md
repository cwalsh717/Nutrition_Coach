# Prep Coach

Multi-user meal-prep planner with a weekly **calorie bank**: plan recipes and
staples for the week, review the shopping list item by item (Need / Have),
track what you actually eat, and talk to an AI coach that only knows what you
told it.

## Core ideas

- **Zero seeded data.** Every account starts empty: no pantry list, no
  staples, no default targets. Onboarding *suggests* a calorie bank from your
  own vitals (Mifflin-St Jeor) and you drag a slider to whatever you'll
  actually stick to.
- **The user decides everything on the shopping list.** No automated "you
  probably have salt so we removed it." Items are only *sorted* so likely buys
  come first; each one gets a Need or Have decision.
- **Bank over days.** It's easy to overeat one day and hard to overeat a week
  that was planned and bought as one bank. The bank meter shows planned kcal
  vs the weekly target; Track shows spent kcal against the same bank.
- **Plans and records are separate.** The food diary and weigh-ins belong to
  the user and a date, not to a week plan — tracking works whether or not
  anything was planned. Finished weeks freeze their numbers forever.

## Stack

Next.js 16 (App Router, TypeScript) · Tailwind v4 + shadcn/ui · Prisma 7 +
PostgreSQL · better-auth (email/password) · Anthropic API for recipe parsing,
food estimates, and the coach.

## Local development

Requires Node 20+ and PostgreSQL.

```bash
npm install
cp .env.example .env      # set DATABASE_URL, ANTHROPIC_API_KEY, BETTER_AUTH_SECRET
npx prisma migrate deploy # apply migrations
npm run dev               # http://localhost:3000
```

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm test` | Unit tests for the pure logic (bank math, energy math, shopping merge) |
| `npx prisma studio` | Database GUI |
| `npx prisma generate` | Regenerate the client after schema changes |

`launchd/com.prepcoach.plist` is an optional macOS agent that keeps the dev
server running permanently; edit its paths before installing.

## Layout

```
prisma/schema.prisma      the data model
prisma/migrations/        hand-written SQL migrations
src/lib/                  pure, unit-tested logic (targets, energy, progress,
                          shopping, week math) + auth config and db client
src/lib/claude/           the three AI calls: parse-recipe, coach, estimate-food
src/actions/              server actions — every mutation, all ownership-checked
src/app/                  pages and API routes
src/components/           React components (ui/ = shadcn primitives)
```

Architecture notes:

- Pages fetch and render; all writes go through server actions that begin
  with `requireUser()`. The middleware cookie check is UX only — `requireUser()`
  is the security boundary.
- Modules that touch secrets import `"server-only"`, so importing them from
  client code fails the build.
- AI calls use strict-JSON prompts validated with Zod; a failed parse returns
  a typed error and never loses the user's input.

## Deploy (Railway)

Connect the GitHub repo (**New Project → Deploy from GitHub repo**), add a
PostgreSQL service, and set the app variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ANTHROPIC_API_KEY` | your key — every user's AI calls bill to it |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | the public domain (Settings → Networking → Generate Domain) |

Every push to `main` deploys. `npm start` runs `prisma migrate deploy` before
booting, so schema changes ship themselves. Login breaks if `BETTER_AUTH_URL`
doesn't match the public domain — it's the variable to double-check.

Signup is open to anyone with the URL. The cheapest ways to limit that are an
invite-code check on signup, an `ALLOW_SIGNUPS` env flag, or a per-user daily
cap on AI calls.
