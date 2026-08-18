// The public landing page. Server component, static content, no auth.
//
// Everything visual here is borrowed rather than invented: the bank ring, the
// day-by-day chart and the two-ledger bars are the app's own components fed
// demo numbers, so this page cannot drift away from the thing it advertises.
// The one hand-built piece is the Need/Have row, because the real one is a
// client component wired to server actions.

import Link from "next/link";
import { BankMeter } from "@/components/bank-meter";
import { DailyChart, GoalRaceBar, type DayBar } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A plausible week: 12,400 kcal of recipes + 3,860 of staples against a
// 17,500 bank leaves 1,240 still to plan.
const DEMO_WEEK = { totalKcal: 16260, recipeKcal: 12400, stapleKcal: 3860, budgetKcal: 17500 };

const DEMO_DAYS: DayBar[] = [
  { label: "Mon", kcal: 2410, state: "logged" },
  { label: "Tue", kcal: 2180, state: "logged" },
  { label: "Wed", kcal: 3050, state: "logged" },
  { label: "Thu", kcal: 0, state: "empty" },
  { label: "Fri", kcal: 1940, state: "logged" },
  { label: "Sat", kcal: 0, state: "empty" },
  { label: "Sun", kcal: 2050, state: "logged" },
];

export function Landing() {
  return (
    <>
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
          <span className="font-display text-lg italic text-primary">Prep Coach</span>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Hero />
        <Loop />
        <Principles />
        <Ai />
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-6 text-sm">
          <span className="font-display italic text-primary">Prep Coach</span>
          <div className="ml-auto flex items-center gap-4">
            <Link href="/signup" className="text-muted-foreground hover:text-foreground">
              Sign up
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Log in
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}

/* ---------------- Hero ---------------- */

function Hero() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:py-20">
      <div className="grid items-center gap-10 md:grid-cols-[1fr_auto] md:gap-12">
        <div>
          <h1 className="text-3xl leading-tight text-balance sm:text-4xl">
            Plan the week, bank the calories, shop once.
          </h1>
          <p className="mt-5 max-w-prose text-lg text-pretty text-muted-foreground">
            A meal-prep planner and food diary built around a weekly calorie bank. It&rsquo;s easy to
            overeat a day. It&rsquo;s hard to overeat a week you planned, bought, and are watching.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">Create an account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/login">Log in</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            A new account starts empty — no staples, no pantry guesses, no targets you didn&rsquo;t set.
          </p>
        </div>

        {/* The meter's four-across stat row has a wide min-content; below ~360px it
            scrolls inside its own box rather than pushing the page sideways. */}
        <div className="min-w-0 overflow-x-auto">
          <BankMeter {...DEMO_WEEK} className="mx-auto w-full max-w-sm md:w-96" />
        </div>
      </div>
    </section>
  );
}

/* ---------------- The loop ---------------- */

const STEPS = [
  {
    title: "Read a recipe in.",
    body: (
      <>
        Paste the text — a recipe site, a video description, your own notes — and the parser pulls
        out servings, macros and an ingredient list. It lands in a form. You fix what it got wrong
        and save it yourself; nothing is stored until you do.
      </>
    ),
  },
  {
    title: "Plan the week against the bank.",
    body: (
      <>
        Pick the meals you&rsquo;ll cook and the staples you&rsquo;ll buy. The ring shows what
        you&rsquo;ve planned against that week&rsquo;s calorie bank, so you find out you&rsquo;re
        over on Sunday instead of on Thursday.
      </>
    ),
  },
  {
    title: "Review the list, then walk the store.",
    body: (
      <>
        Every line waits for a Need or a Have. Things you probably keep around sort to the bottom —
        but nothing is removed for you. Then copy the list out grouped in the order you actually
        walk the store: produce first, frozen near the end.
      </>
    ),
    vignette: <NeedHaveVignette />,
  },
  {
    title: "Track what you actually ate.",
    body: (
      <>
        Log it as you go — type it and let the advisor estimate, or tap a food you&rsquo;ve saved
        before. The diary belongs to you and a date, not to a plan, so it works on weeks you never
        planned at all.
      </>
    ),
  },
];

function Loop() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <SectionHead eyebrow="The loop" title="How a week actually goes." />
      <ol className="mt-7 grid gap-4 sm:grid-cols-2">
        {STEPS.map((step, i) => (
          <li key={step.title} className="min-w-0 rounded-xl border bg-card/60 p-4">
            <div className="flex items-baseline gap-3">
              <span className="grid size-6 shrink-0 translate-y-0.5 place-items-center rounded-full border border-primary text-xs tabular-nums text-primary">
                {i + 1}
              </span>
              <h3 className="font-display text-lg leading-snug">{step.title}</h3>
            </div>
            <p className="mt-2 text-sm text-pretty text-muted-foreground">{step.body}</p>
            {step.vignette}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------- What makes it different ---------------- */

function Principles() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <SectionHead eyebrow="The principles" title="Where it disagrees with other trackers." />
      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <Principle title="You own every number.">
          The app suggests: a weekly bank from your own vitals, a protein range, a maintenance
          figure — and it shows the arithmetic behind each one. You confirm it, drag it, or type
          your own instead. Nothing auto-saves a judgment call, and the bank never moves on its own.
        </Principle>

        <Principle
          title="Unknown is never zero."
          vignette={
            <>
              <DailyChart days={DEMO_DAYS} rate={2500} />
              <p className="mt-3 text-xs text-muted-foreground">
                Dashed outlines are unlogged days: unknown, not zero.
              </p>
            </>
          }
        >
          A day you didn&rsquo;t log is not a zero-calorie day, so it&rsquo;s never counted as one.
          A week with days missing isn&rsquo;t scored at all — no win, no loss. Days you
          deliberately mark as not tracked don&rsquo;t count against you. The app would rather tell
          you what it can&rsquo;t see than guess at it.
        </Principle>

        <Principle
          title="Two ledgers, kept honest."
          vignette={
            <>
              <GoalRaceBar
                totalKcal={70000}
                byCaloriesKcal={38500}
                byScaleKcal={29750}
                direction="lose"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Same goal, two sources, one visible gap.
              </p>
            </>
          }
        >
          What you ate and what you weigh are two independent estimates of the same journey.
          Progress shows both — what the calories say, what the scale says — on the same scale. When
          they disagree by enough to matter, it names the input that&rsquo;s most likely off instead
          of averaging them into one comfortable number.
        </Principle>

        <Principle title="A plan is just a plan.">
          Weeks are for planning; they don&rsquo;t own your history. Your diary and your weigh-ins
          are filed by date and outlive any plan. A week keeps the targets it was created with, and
          closing it freezes its numbers — editing a recipe next month never rewrites a week you
          already cooked.
        </Principle>
      </div>
    </section>
  );
}

function Principle({
  title, children, vignette,
}: {
  title: string;
  children: React.ReactNode;
  vignette?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border bg-card/60 p-4">
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-2 text-sm text-pretty text-muted-foreground">{children}</p>
      {vignette && <div className="mt-5">{vignette}</div>}
    </div>
  );
}

/* ---------------- The AI ---------------- */

const AI_PARTS = [
  {
    title: "Reading a recipe.",
    body: (
      <>
        Turns pasted text into servings, ingredients and macros — into a review form. If the parse
        comes back wrong, your paste is still sitting there to try again.
      </>
    ),
  },
  {
    title: "Estimating a food.",
    body: (
      <>
        Describe what you ate and it fills in a calorie and protein guess. It fills the fields;
        you&rsquo;re the one who presses Add.
      </>
    ),
  },
  {
    title: "The coach.",
    body: (
      <>
        A chat that knows your profile, this week&rsquo;s plan and list, and your diary — because
        you&rsquo;re the one who put them there. It&rsquo;s read-only by design: it can tell you
        what to change and which page to change it on, and that&rsquo;s all it can do.
      </>
    ),
  },
];

function Ai() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <SectionHead eyebrow="The AI" title="Three places, and what each is allowed to do." />
      <p className="mt-5 max-w-prose text-pretty text-muted-foreground">
        There&rsquo;s a model behind three features. None of them write to your data.
      </p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        {AI_PARTS.map((part) => (
          <div key={part.title} className="rounded-xl border bg-card/60 p-4">
            <dt className="font-medium">{part.title}</dt>
            <dd className="mt-2 text-sm text-pretty text-muted-foreground">{part.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------------- Bits ---------------- */

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</div>
      <div className="hairline mt-2" />
      <h2 className="font-display mt-4 text-2xl text-balance sm:text-3xl">{title}</h2>
    </div>
  );
}

// A still frame of the Need/Have review: one decided each way, one still
// waiting. Non-interactive by design — the real thing lives behind the login.
const DEMO_ITEMS = [
  { name: "2 lb chicken thighs", meta: "Meat & Seafood · Sheet-pan chicken", status: "need" },
  { name: "1 bunch scallions", meta: "Produce · Chili crisp noodles", status: "unreviewed" },
  { name: "olive oil", meta: "Pantry & Dry Goods · Sheet-pan chicken", status: "have" },
] as const;

function NeedHaveVignette() {
  return (
    <div className="mt-5 grid gap-1.5">
      {DEMO_ITEMS.map((item) => (
        <div
          key={item.name}
          className={cn(
            "flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2",
            item.status === "have" && "opacity-50",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{item.name}</div>
            <div className="text-xs text-muted-foreground">{item.meta}</div>
          </div>
          <div className="flex gap-1">
            <Chip label="Have" active={item.status === "have"} />
            <Chip label="Need" active={item.status === "need"} primary />
          </div>
        </div>
      ))}
      <p className="mt-1 text-xs text-muted-foreground">
        Nothing is removed for you — you make every call.
      </p>
    </div>
  );
}

function Chip({ label, active, primary }: { label: string; active: boolean; primary?: boolean }) {
  return (
    <span
      className={cn(
        "min-w-14 rounded-md border px-2.5 py-1.5 text-center text-xs font-medium",
        active && primary && "border-primary bg-primary text-primary-foreground",
        active && !primary && "border-foreground/40 bg-muted",
        !active && "text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
