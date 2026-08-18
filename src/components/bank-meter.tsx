// The calorie bank, calm-premium style: a thin parchment ring with the number
// that matters in the middle, and the supporting numbers in a quiet row below.
// Server component — pure display. No target set → planned total only, no judgment.
//
// LANDING-PAGE ONLY since the Plan rework: inside the app the bank is a quiet
// text barometer, not a ring — nothing may nag the user to "fill" the plan.
// This survives purely as the marketing demo on the public landing page.

import { cn } from "@/lib/utils";

interface Props {
  totalKcal: number;
  recipeKcal: number;
  stapleKcal: number;
  budgetKcal: number | null;
  /** 1-7. Shown when this week covers fewer than 7 days (bank is prorated). */
  dayCount?: number;
  className?: string;
}

export function BankMeter({
  totalKcal, recipeKcal, stapleKcal, budgetKcal, dayCount = 7, className,
}: Props) {
  const pct = budgetKcal ? Math.min(100, (totalKcal / budgetKcal) * 100) : null;
  const gap = budgetKcal === null ? null : budgetKcal - totalKcal;
  const over = gap !== null && gap < 0;

  // Ring: filled arc = planned share of the bank; parchment on a faint track.
  const ringStyle =
    pct === null
      ? undefined
      : {
          background: `conic-gradient(${
            over ? "var(--destructive)" : "var(--primary)"
          } ${pct * 3.6}deg, oklch(1 0 0 / 8%) ${pct * 3.6}deg 360deg)`,
        };

  return (
    <div className={cn("rounded-2xl border bg-card/60 px-4 py-6 text-center", className)}>
      {pct !== null ? (
        <>
          <div className="relative mx-auto size-44 rounded-full" style={ringStyle}>
            <div className="absolute inset-[5px] rounded-full bg-[oklch(0.25_0.02_164)]" />
            <div className="absolute inset-0 grid place-items-center">
              <div>
                <div className={cn("font-display text-4xl", over && "text-destructive")}>
                  {Math.abs(gap!).toLocaleString()}
                </div>
                <div className="mt-1 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                  {over ? "kcal over the bank" : "kcal left to plan"}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex items-start justify-center gap-9">
            <Duo value={totalKcal.toLocaleString()} label="planned" />
            <Duo value={recipeKcal.toLocaleString()} label="recipes" />
            <Duo value={stapleKcal.toLocaleString()} label="staples" />
            <Duo value={compact(budgetKcal!)} label="the bank" />
          </div>
          {dayCount < 7 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Short week — bank prorated for {dayCount} of 7 days
            </p>
          )}
        </>
      ) : (
        <>
          <div className="font-display text-4xl">{totalKcal.toLocaleString()}</div>
          <div className="mt-1 text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            kcal planned · no bank target set
          </div>
          <div className="mt-4 flex items-start justify-center gap-9">
            <Duo value={recipeKcal.toLocaleString()} label="recipes" />
            <Duo value={stapleKcal.toLocaleString()} label="staples" />
          </div>
        </>
      )}
    </div>
  );
}

function Duo({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-lg text-primary">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
    </div>
  );
}

function compact(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : n.toLocaleString();
}
