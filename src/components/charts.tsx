// Charts for the Progress page. Deliberately plain: CSS-sized bars and one
// small SVG polyline rather than a chart library. Every mark has a title
// attribute, so hovering gives the exact numbers.
//
// Colour carries meaning, not identity: parchment = under the bank (a deficit,
// the goal), terracotta = over. Reference lines and grid stay recessive.

import { cn } from "@/lib/utils";
import type { Band } from "@/lib/progress";

/* ---------------- The goal burn-down (the hero) ---------------- */

export function BurnDownBar({
  totalKcal, byCaloriesKcal, byScaleKcal,
}: {
  totalKcal: number;
  byCaloriesKcal: number;
  byScaleKcal: number | null;
}) {
  const pct = (v: number) => Math.min(Math.max((v / totalKcal) * 100, 0), 100);

  return (
    <div className="space-y-1.5">
      {/* Two thin bars against the same scale, so the food log's story and
          the scale's story are visually comparable. */}
      <Track label="calories say" filledPct={pct(byCaloriesKcal)} value={byCaloriesKcal} />
      {byScaleKcal !== null && (
        <Track label="scale says" filledPct={pct(byScaleKcal)} value={byScaleKcal} />
      )}
    </div>
  );
}

function Track({ label, filledPct, value }: { label: string; filledPct: number; value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 shrink-0 text-right text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      <div
        className="h-3 flex-1 overflow-hidden rounded-full bg-muted"
        title={`${Math.max(value, 0).toLocaleString()} kcal burned so far`}
      >
        <div
          className={cn("h-full rounded-full", value >= 0 ? "bg-primary" : "bg-destructive")}
          style={{ width: `${Math.abs(filledPct)}%` }}
        />
      </div>
    </div>
  );
}

/* ---------------- Weekly wins (one row per calendar week) ---------------- */

export interface WeekRow {
  label: string; // "Jul 26 – Aug 1"
  /** Positive = under the bank. Null = no bank set. */
  delta: number | null;
  consumed: number;
  bank: number | null;
  band: Band | null;
  isWin: boolean | null;
  avgPerDay: number | null;
  loggedDays: number;
  elapsedDays: number;
  inProgress: boolean;
}

const BAND_LABEL: Record<Band, string> = {
  on_target: "on target",
  under: "under",
  over: "over",
};

export function WeeklyWins({ rows }: { rows: WeekRow[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.delta ?? 0)), 1);

  return (
    <div className="space-y-2.5">
      {rows.map((row) => {
        const under = (row.delta ?? 0) >= 0;
        const width = row.delta === null ? 0 : (Math.abs(row.delta) / max) * 50;
        const coverage =
          row.loggedDays < row.elapsedDays
            ? `${row.loggedDays}/${row.elapsedDays} days logged`
            : null;
        return (
          <div key={row.label} className="flex items-center gap-3">
            {/* Verdict mark: ✓ win, ✗ loss, ○ still running or not scorable */}
            <div
              className={cn(
                "w-5 shrink-0 text-center font-display text-base",
                row.isWin === true && "text-primary",
                row.isWin === false && "text-destructive",
                row.isWin === null && "text-muted-foreground/60",
              )}
              title={
                row.inProgress
                  ? "still running"
                  : row.isWin === true
                    ? "win"
                    : row.isWin === false
                      ? "loss"
                      : "not scored — days missing or no bank"
              }
            >
              {row.isWin === true ? "✓" : row.isWin === false ? "✗" : "○"}
            </div>

            <div className="w-28 shrink-0 text-xs">
              <div className="text-muted-foreground">
                {row.label}
                {row.inProgress && <span className="text-primary"> · now</span>}
              </div>
              <div className="text-[10px] text-muted-foreground/70">
                {row.avgPerDay !== null && `${row.avgPerDay.toLocaleString()}/day`}
                {coverage && ` · ${coverage}`}
              </div>
            </div>

            <div className="relative h-7 flex-1">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              {row.delta !== null && (
                <div
                  title={`${row.consumed.toLocaleString()} eaten of ${row.bank!.toLocaleString()}${row.inProgress ? " so far" : ""}`}
                  className={cn(
                    "absolute top-1/2 h-4 -translate-y-1/2",
                    under ? "left-1/2 rounded-r bg-primary" : "right-1/2 rounded-l bg-destructive",
                    row.inProgress && "opacity-50",
                  )}
                  style={{ width: `${width}%` }}
                />
              )}
            </div>

            <div className="flex w-36 shrink-0 items-center justify-end gap-2">
              {row.band !== null && (
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
                    row.band === "on_target" && "border-primary/50 text-primary",
                    row.band === "under" && "text-muted-foreground",
                    row.band === "over" && "border-destructive/50 text-destructive",
                  )}
                >
                  {BAND_LABEL[row.band]}
                </span>
              )}
              {row.delta !== null && (
                <span
                  className={cn(
                    "text-sm tabular-nums",
                    under ? "text-primary" : "text-destructive",
                  )}
                >
                  {under ? "−" : "+"}
                  {Math.abs(row.delta).toLocaleString()}
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
    </div>
  );
}

/* ---------------- Daily calories within one week ---------------- */

export interface DayBar {
  label: string;
  kcal: number;
  logged: boolean;
  isToday?: boolean;
}

export function DailyChart({ days, rate }: { days: DayBar[]; rate: number | null }) {
  const max = Math.max(...days.map((d) => d.kcal), rate ?? 0, 1);
  const ratePct = rate === null ? null : (rate / max) * 100;

  return (
    <div>
      <div className="relative flex h-48 items-end gap-2">
        {/* daily allowance reference line */}
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
        {days.map((day) => {
          const over = rate !== null && day.kcal > rate;
          return (
            // h-full so the bar's percentage height has a definite parent to
            // resolve against — otherwise it collapses to nothing.
            <div key={day.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              {day.kcal > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {day.kcal.toLocaleString()}
                </span>
              )}
              <div
                title={day.logged ? `${day.kcal.toLocaleString()} kcal` : "nothing logged"}
                className={cn(
                  "w-full rounded-t",
                  !day.logged && "bg-muted",
                  day.logged && (over ? "bg-destructive" : "bg-primary"),
                )}
                style={{ height: `${Math.max((day.kcal / max) * 100, day.logged ? 2 : 1)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {days.map((day) => (
          <div
            key={day.label}
            className={cn(
              "flex-1 text-center text-[10px]",
              day.isToday ? "font-semibold text-foreground" : "text-muted-foreground",
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
 * A polyline rather than bars: weigh-ins are a trend around a narrow range,
 * and bars anchored at zero would flatten a 5 lb move into invisibility.
 * The y-axis spans the data plus the goal, padded so the line breathes.
 */
export function WeightChart({ points, goalLb }: { points: WeightPoint[]; goalLb: number | null }) {
  const W = 600;
  const H = 160;
  const PAD = 8;

  const values = [...points.map((p) => p.weightLb), ...(goalLb !== null ? [goalLb] : [])];
  const lo = Math.min(...values) - 2;
  const hi = Math.max(...values) + 2;

  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points.at(-1)!.date);
  const span = Math.max(t1 - t0, 1);

  const x = (date: string) => PAD + ((Date.parse(date) - t0) / span) * (W - 2 * PAD);
  const y = (lb: number) => PAD + ((hi - lb) / (hi - lo)) * (H - 2 * PAD);

  const line = points.map((p) => `${x(p.date).toFixed(1)},${y(p.weightLb).toFixed(1)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full" preserveAspectRatio="none">
        {goalLb !== null && (
          <line
            x1={0} x2={W} y1={y(goalLb)} y2={y(goalLb)}
            className="stroke-muted-foreground/50" strokeWidth="1" strokeDasharray="4 4"
          />
        )}
        {points.length > 1 && (
          <polyline
            points={line}
            fill="none"
            className="stroke-primary"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {points.map((p) => (
          <circle
            key={p.date}
            cx={x(p.date)} cy={y(p.weightLb)} r="3.5"
            className="fill-primary"
          >
            <title>{`${p.weightLb} lb — ${p.date}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{prettyShort(points[0].date)}</span>
        {goalLb !== null && <span>goal {goalLb} lb</span>}
        <span>{prettyShort(points.at(-1)!.date)}</span>
      </div>
    </div>
  );
}

function prettyShort(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC",
  });
}
