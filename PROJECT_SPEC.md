# Prep Coach — Project Spec v2

(v1 spec — single-user Python app — is in git history at tag `v1`.)

## What this is

A meal-prep planning web app **for customers, not for one person**. Anyone can sign
up and gets their own completely empty
account. ZERO data is seeded and ZERO assumptions are baked in: no pantry lists, no
staples, no default calorie targets. Every number in the app is either entered by the
user or suggested from the user's own inputs with the user having final say.

## The core loop

**First run (onboarding):**
1. Pick a goal: lose / gain / maintain weight, or "just eat cleaner" (no target).
2. Enter basic vitals: sex, age, height, weight (goal weight optional).
3. The app SUGGESTS a weekly calorie bank (Mifflin-St Jeor BMR × activity × 7,
   adjusted for goal) on a slider. The user drags it to whatever they'll stick to
   and confirms. "Eat cleaner" skips the target.

**The weekly calorie bank** is the central concept: it's easy to overeat one day,
hard to overeat the whole week if the week is planned and bought as one bank.
Every user's bank is their own number, chosen on their own slider.

**Each week:**
1. Start a week — it copies the user's current targets (finished weeks keep their
   numbers forever).
2. Add recipes from the personal Cook Book, or ingest new ones: paste a YouTube
   description → Claude parses to an editable review form → user fixes and saves.
   A failed parse NEVER loses the pasted text.
3. Shopping page: build the list from recipes (scaled to portions) + chosen staples.
   **Interactive review** — every item gets a user decision, Need or Have. Items are
   sorted likely-need first / likely-have last (steak top, salt bottom, driven by a
   staple-hint flag from the parse) but the sort is the ONLY automation; nothing is
   ever removed for the user.
4. Fill the bank: the page shows planned kcal vs the bank with the shortfall
   explicit. User adds staples (from their grown-over-time library: iced tea, jerky,
   whatever THEY buy) and filler meals (breakfast/snack/shake recipes) to close it.
5. Export: Need-items only, grouped by department in store-walk order, plain-text
   copy for a ShopRite pickup order, with the estimated week total kcal.
6. Track (optional): day-by-day food diary. Type what you ate + kcal, or "Ask
   advisor" — Claude estimates kcal/macros and PREFILLS the form (user confirms;
   estimates are never auto-saved). Header shows today's total and bank remaining.
7. Coach chat: sees the user's profile (only what they filled in — empty profile
   means generic coach with no invented stats), the week plan, list state, and
   diary. Read-only: it advises and points at the UI; it never writes data.

## Stack

- Next.js (App Router, TypeScript), Tailwind v4, shadcn/ui components
- PostgreSQL via Prisma (local: Postgres.app; production: Railway Postgres)
- better-auth: email + password accounts, open signup, DB sessions
- Anthropic API, model `claude-sonnet-4-6`, ONE server-side key (owner pays for
  all users' calls); strict-JSON prompts + Zod validation (the model isn't in the
  structured-outputs supported list)
- Deploy: Railway (app service + Postgres); migrations run on boot

## Hard rules

1. Per-user scoping on every query; server actions re-derive the user from the
   session and verify row ownership. Never trust a client-supplied ID.
2. No seeds. A new account has empty everything and null targets.
3. Targets are optional everywhere — no target set means totals are shown with
   zero judgment.
4. Weeks snapshot their numbers (targets copied at creation; list items and week
   staples are value copies). Done weeks never change retroactively.
5. AI output never writes directly: parses land in review forms, estimates
   prefill inputs, the coach only talks.
6. The pasted recipe text survives every failure path and is stored on the recipe.
7. One active week per user at a time.

## Non-goals (v2)

- No barcode scanning, photo input, or grocery-store API integrations
- No password reset flow yet (owner resets manually in DB; add later)
- No admin panel; signup gating is by URL secrecy (env-flag hardening later)
- Coach tool-use (writing to the plan) remains a future idea
