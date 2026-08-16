// Charts for the Progress page. Deliberately plain: CSS-sized bars and one
// small SVG polyline rather than a chart library. Every mark has a title
// attribute, so hovering gives the exact numbers.
//
// Colour carries meaning, not identity — and the meaning follows the user's
// DIRECTION: parchment marks progress toward the goal (a deficit for a loser,
// a surplus for a gainer, steadiness for a maintainer), terracotta marks
// movement away from it. The scale math lives in lib/chartmath, tested.

import { cn } from "@/lib/utils";
import type { Band, DayState, WeekVerdict, WinsRow } from "@/lib/progress";
import type { Direction } from "@/lib/goal";
import { bandTone } from "@/lib/goal";
import { deltaBarPct, niceTicks, weightDomain } from "@/lib/chartmath";

/* ---------------- The goal race (the hero) ---------------- */

/**
 * Two thin bars against the same scale: the food log's story and the scale's
 * story of the same journey. Values are progress-signed (positive = toward
 * the goal, whichever way it points) — negative progress renders as a real
 * wrong-direction bar, never as an empty track pretending nothing happened.
 */
export function GoalRaceBar({
  totalKcal, byCaloriesKcal, byScaleKcal, direction,
}: {
  totalKcal: number;
  byCaloriesKcal: number;
  byScaleKcal: number | null;
  direction: "lose" | "gain";
}) {
  const verb = direction === "lose" ? "burned" : "banked";
  return (
    <div className="space-y-1.5">
      <Track label="calories say" totalKcal={totalKcal} value={byCaloriesKcal} verb={verb} />
      {byScaleKcal !== null && (
        <Track label="scale says" totalKcal={totalKcal} value={byScaleKcal} verb={verb} />
      )}
    </div>
  );
}

function Track({
  label, totalKcal, value, verb,
}: {
  label: string; totalKcal: number; value: number; verb: string;
}) {
  const pct = totalKcal <= 0 ? 0 : Math.min((Math.abs(value) / totalKcal) * 100, 100);
  const wrongWay = value < 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div
        className="h-3 flex-1 overflow-hidden rounded-full bg-muted"
        title={
          wrongWay
            ? `${Math.abs(value).toLocaleString()} kcal in the wrong direction`
            : `${value.toLocaleString()} kcal ${verb} toward the goal`
        }
      >
        <div
          className={cn("h-full rounded-full", wrongWay ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ---------------- Weekly wins (one row per calendar week) ---------------- */

const BAND_LABEL: Record<Band, string> = {
  on_target: "on target",
  under: "under",
  over: "over",
};

const TONE_TEXT = {
  good: "text-primary",
  bad: "text-destructive",
  neutral: "text-muted-foreground",
} as const;

const TONE_CHIP = {
  good: "border-primary/50 text-primary",
  bad: "border-destructive/50 text-destructive",
  neutral: "text-muted-foreground",
} as const;

export interface WinsDisplayRow {
  row: WinsRow<WeekVerdict>;
  /** Pre-formatted by the page (year added when not current). */
  label: string;
}

/**
 * The wins list. Bars run on a FIXED scale — a full half-track is one pound
 * of bank delta — so this week's bar and last month's bar mean the same
 * thing. Which side is "good" follows the direction.
 */
export function WeeklyWins({
  rows, direction, olderCount, showAllHref,
}: {
  rows: WinsDisplayRow[];
  direction: Direction;
  olderCount: number;
  showAllHref?: string;
}) {
  return (
    <div className="space-y-2.5">
      {rows.map(({ row, label }) => {
        if (row.kind === "new-week") {
          return (
            <p key={`new-${row.weekOf}`} className="py-1 text-xs text-muted-foreground">
              New week — nothing logged yet.
            </p>
          );
        }
        if (row.kind === "gap") {
          return (
            <p key={`gap-${row.from}`} className="py-1 text-xs text-muted-foreground/70">
              {row.weeks} week{row.weeks === 1 ? "" : "s"} with no logging · {label}
            </p>
          );
        }
        if (row.kind === "off-week") {
          return (
            <p key={`off-${row.week.weekOf}`} className="py-1 text-xs text-muted-foreground">
              {label} — marked not tracked. Counts nowhere, breaks nothing.
            </p>
          );
        }

        const week = row.week;
        const tone = week.band === null ? "neutral" : bandTone(week.band, direction);
        const under = (week.bankDelta ?? 0) >= 0;
        const width = deltaBarPct(week.bankDelta);
        const clamped = week.bankDelta !== null && Math.abs(week.bankDelta) > 3500;

        return (
          <div key={week.weekOf} className="flex items-center gap-3">
            <div
              className={cn(
                "w-5 shrink-0 text-center font-display text-base",
                week.isWin === true && "text-primary",
                week.isWin === false && "text-destructive",
                week.isWin === null && "text-muted-foreground/60",
              )}
              title={
                week.inProgress
                  ? "still running"
                  : week.isWin === true
                    ? "win"
                    : week.isWin === false
                      ? "loss"
                      : "not scored — days missing or no bank"
              }
            >
              {week.isWin === true ? "✓" : week.isWin === false ? "✗" : "○"}
            </div>

            <div className="w-28 shrink-0 text-xs">
              <div className="text-muted-foreground">
                {label}
                {week.inProgress && <span className="text-primary"> · now</span>}
              </div>
              <div className="text-[10px] text-muted-foreground/70">
                {week.avgKcalPerLoggedDay !== null &&
                  `${week.avgKcalPerLoggedDay.toLocaleString()}/day`}
                {week.missedDays > 0 &&
                  ` · ${week.missedDays} day${week.missedDays === 1 ? "" : "s"} missing`}
                {week.untrackedDays > 0 && ` · ${week.untrackedDays} off`}
              </div>
            </div>

            <div className="relative h-7 flex-1">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {width !== null && (
                <div
                  title={`${week.consumedKcal.toLocaleString()} eaten of ${week.bankSoFarKcal!.toLocaleString()}${week.inProgress ? " so far" : ""}${clamped ? " (bar capped at 1 lb)" : ""}`}
                  className={cn(
                    "absolute top-1/2 h-4 -translate-y-1/2",
                    under ? "left-1/2 rounded-r" : "right-1/2 rounded-l",
                    tone === "good" ? "bg-primary" : tone === "bad" ? "bg-destructive" : "bg-muted-foreground/40",
                    week.inProgress && "opacity-50",
                  )}
                  style={{ width: `${width! / 2}%` }}
                >
                  {clamped && (
                    <span
                      className={cn(
                        "absolute top-0 h-full w-0.5 bg-background",
                        under ? "right-0" : "left-0",
                      )}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex w-36 shrink-0 items-center justify-end gap-2">
              {week.band !== null && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                    TONE_CHIP[tone],
                  )}
                >
                  {BAND_LABEL[week.band]}
                </span>
              )}
              {week.bankDelta !== null && (
                <span className={cn("text-sm tabular-nums", TONE_TEXT[tone])}>
                  {under ? "−" : "+"}
                  {Math.abs(week.bankDelta).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3 pt-1">
        <div className="w-5 shrink-0" />
        <div className="w-28 shrink-0" />
        <div className="flex flex-1 justify-between text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          <span>over the bank</span>
          <span>under the bank</span>
        </div>
        <div className="w-36 shrink-0" />
      </div>

      {olderCount > 0 && showAllHref && (
        <a href={showAllHref} className="block pt-1 text-xs text-muted-foreground underline">
          Show {olderCount} older week{olderCount === 1 ? "" : "s"}
        </a>
      )}
    </div>
  );
}

/* ---------------- Daily calories within one week ---------------- */

export interface DayBar {
  label: string;
  kcal: number;
  state: DayState;
  isToday?: boolean;
}

/**
 * One bar per day. A logged day is always parchment — a big day inside a
 * winning week is the whole point of banking weekly, so the chart doesn't
 * scold it. The other three states are visually distinct facts: a missed day
 * (dashed outline), a day off (small muted tick), a future day (nothing).
 */
export function DailyChart({ days, rate }: { days: DayBar[]; rate: number | null }) {
  const max = Math.max(...days.map((d) => d.kcal), rate ?? 0, 1);
  const ratePct = rate === null ? null : (rate / max) * 100;

  return (
    <div>
      <div className="relative flex h-48 items-end gap-2">
        {ratePct !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/50"
            style={{ bottom: `${ratePct}%` }}
          >
            <span className="absolute -top-4 right-0 text-[10px] text-muted-foreground">
              {rate!.toLocaleString()}/day
            </span>
          </div>
        )}
        {days.map((day) => (
          <div key={day.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            {day.state === "logged" && day.kcal > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground">
                {day.kcal.toLocaleString()}
              </span>
            )}
            {day.state === "logged" && (
              <div
                title={`${day.kcal.toLocaleString()} kcal`}
                className="w-full rounded-t bg-primary"
                style={{ height: `${Math.max((day.kcal / max) * 100, 2)}%` }}
              />
            )}
            {day.state === "empty" && (
              <div
                title="not logged — unknown, not zero"
                className="w-full rounded-t border border-dashed border-muted-foreground/40"
                style={{ height: "14%" }}
              />
            )}
            {day.state === "untracked" && (
              <div title="marked not tracked" className="w-full rounded-t bg-muted" style={{ height: "4%" }} />
            )}
            {/* future days render nothing — they haven't happened */}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {days.map((day) => (
          <div
            key={day.label}
            className={cn(
              "flex-1 text-center text-[10px]",
              day.isToday ? "font-semibold text-foreground" : "text-muted-foreground",
              day.state === "untracked" && "line-through opacity-60",
            )}
          >
            {day.label}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Weight over time ---------------- */

export interface WeightPoint {
  date: string; // YYYY-MM-DD
  weightLb: number;
}

/**
 * The line is SVG (stretchy, non-scaling stroke so it doesn't fatten on wide
 * screens); the dots are HTML positioned by percentage so they stay round —
 * a stretched SVG circle renders as an ellipse. Y-domain zooms to the
 * readings (lib/chartmath): a far-away goal lives in the corner annotation
 * the page renders, not inside the scale, where it would flatten months of
 * progress into a straight line.
 */
export function WeightChart({
  points, goalLb, band,
}: {
  points: WeightPoint[];
  goalLb: number | null;
  /** Steadiness band for maintainers: shaded ± range around the baseline. */
  band?: { centerLb: number; halfLb: number };
}) {
  const domain = weightDomain(
    [...points.map((p) => p.weightLb), ...(band ? [band.centerLb + band.halfLb, band.centerLb - band.halfLb] : [])],
    goalLb,
  );
  const { lo, hi } = domain;
  const ticks = niceTicks(lo, hi);

  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points.at(-1)!.date);
  const span = Math.max(t1 - t0, 1);

  // Percent coordinates shared by the SVG (viewBox 0..100) and the HTML dots.
  const xPct = (date: string) => ((Date.parse(date) - t0) / span) * 100;
  const yPct = (lb: number) => ((hi - lb) / (hi - lo)) * 100;

  const line = points.map((p) => `${xPct(p.date).toFixed(2)},${yPct(p.weightLb).toFixed(2)}`).join(" ");

  return (
    <div className="flex gap-2">
      {/* y-axis gutter */}
      <div className="relative w-8 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground">
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${yPct(t)}%` }}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative h-40">
          <svg viewBox="0 0 100 100" className="h-full w-full" preserveAspectRatio="none">
            {band && (
              <rect
                x="0"
                width="100"
                y={yPct(band.centerLb + band.halfLb)}
                height={yPct(band.centerLb - band.halfLb) - yPct(band.centerLb + band.halfLb)}
                className="fill-primary/10"
              />
            )}
            {ticks.map((t) => (
              <line
                key={t}
                x1="0" x2="100" y1={yPct(t)} y2={yPct(t)}
                className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
            ))}
            {domain.goalInline && goalLb !== null && (
              <line
                x1="0" x2="100" y1={yPct(goalLb)} y2={yPct(goalLb)}
                className="stroke-muted-foreground/60" strokeWidth="1.5"
                strokeDasharray="4 4" vectorEffect="non-scaling-stroke"
              />
            )}
            {points.length > 1 && (
              <polyline
                points={line}
                fill="none"
                className="stroke-primary"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
          </svg>
          {points.map((p, i) => {
            const prev = i > 0 ? points[i - 1].weightLb : null;
            const delta = prev === null ? null : Math.round((p.weightLb - prev) * 10) / 10;
            return (
              <div
                key={p.date}
                title={`${p.weightLb} lb — ${prettyShort(p.date)}${delta !== null ? ` (${delta > 0 ? "+" : ""}${delta} from last)` : ""}`}
                className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                style={{ left: `${xPct(p.date)}%`, top: `${yPct(p.weightLb)}%` }}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{prettyShort(points[0].date)}</span>
          {domain.goalInline && goalLb !== null && <span>goal {goalLb} lb</span>}
          <span>{prettyShort(points.at(-1)!.date)}</span>
        </div>
      </div>
    </div>
  );
}

function prettyShort(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}
