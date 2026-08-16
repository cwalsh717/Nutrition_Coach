import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getEnergyStatus, todayIso } from "@/lib/queries";
import {
  calendarWeeks, cumulativeDeficit, dailyRate, dailyTotals, verdictFor,
  winStreak, type DiaryEntry,
} from "@/lib/progress";
import { burnDown, formulaMaintenance, KCAL_PER_LB } from "@/lib/energy";
import type { Activity, Sex } from "@/lib/targets";
import { BurnDownBar, DailyChart, WeeklyWins, WeightChart } from "@/components/charts";
import { WeightCard } from "@/components/weight-card";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Progress runs on plain calendar weeks read off the food diary — never on
// week plans. You can track without ever planning, and ten logged days must
// show up here whether or not a plan covered them.
export default async function ProgressPage() {
  const user = await requireUser();
  const today = await todayIso();

  const [profile, energy, logRows, weightRows, untrackedRows] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id } }),
    getEnergyStatus(user.id),
    db.foodLogEntry.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
      select: { date: true, kcal: true, proteinG: true },
    }),
    db.weightEntry.findMany({
      where: { userId: user.id },
      orderBy: { date: "asc" },
      select: { id: true, date: true, weightLb: true },
    }),
    db.untrackedDay.findMany({ where: { userId: user.id }, select: { date: true } }),
  ]);
  const untracked = new Set(untrackedRows.map((u) => u.date.toISOString().slice(0, 10)));

  const entries: DiaryEntry[] = logRows.map((e) => ({
    date: e.date.toISOString().slice(0, 10),
    kcal: e.kcal,
    proteinG: e.proteinG,
  }));
  const weighIns = weightRows.map((w) => ({
    id: w.id,
    date: w.date.toISOString().slice(0, 10),
    weightLb: w.weightLb,
  }));

  const bank = profile?.weeklyKcalBudget ?? null;
  const tolerance = energy.bankToleranceKcal;

  // Score each week with the maintenance nearest to it: a manual pin or the
  // data-implied number applies everywhere, but formula maintenance follows
  // the scale week by week, so old weeks keep the burn rate they ran at.
  const weeks = calendarWeeks(entries, today, untracked).map((week) => {
    let maintenanceKcal = energy.maintenance.value;
    if (
      energy.maintenance.source === "formula" &&
      profile?.sex && profile.age && profile.heightIn && profile.activityLevel
    ) {
      const nearest = nearestWeighIn(weighIns, week.weekEnd) ?? profile.weightLb;
      if (nearest !== null) {
        maintenanceKcal = formulaMaintenance(
          { sex: profile.sex as Sex, age: profile.age, heightIn: profile.heightIn, weightLb: nearest },
          profile.activityLevel as Activity,
        );
      }
    }
    return verdictFor(week, { bankKcal: bank, toleranceKcal: tolerance, maintenanceKcal });
  });

  const streak = winStreak(weeks);
  const totalDeficit = cumulativeDeficit(weeks);
  const current = weeks.at(-1) ?? null;
  const lastFinished = [...weeks].reverse().find((w) => !w.inProgress && w.loggedDays > 0) ?? null;
  const totalLogged = weeks.reduce((sum, w) => sum + w.loggedDays, 0);

  // The burn-down needs a starting weight (first weigh-in, else the profile
  // vital) and a goal weight. Missing either, it explains what to add.
  const baselineLb = weighIns[0]?.weightLb ?? profile?.weightLb ?? null;
  const goalLb = profile?.goalWeightLb ?? null;
  const burn =
    baselineLb !== null && goalLb !== null && baselineLb > goalLb
      ? burnDown({
          baselineLb,
          goalLb,
          cumulativeDeficitKcal: totalDeficit,
          // One weigh-in can't measure change; the scale line needs two.
          latestLb: weighIns.length > 1 ? energy.latestWeightLb : null,
        })
      : null;

  if (entries.length === 0) {
    return (
      <Shell>
        <Empty>
          Nothing logged yet. Start on <Link href="/track" className="underline">Track</Link> —
          every day you log builds this page.
        </Empty>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* 1 — The countdown to goal weight, measured two independent ways */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            The burn-down
            <InfoTip>
              Losing a pound takes a ~{KCAL_PER_LB.toLocaleString()} kcal
              deficit, so your goal is a fixed amount of calories to burn.
              Every week&apos;s deficit chips away at it. The scale line is the
              audit: when it disagrees with the calorie line, the maintenance
              estimate is what&apos;s off.
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {burn === null ? (
            <Empty>
              Set a goal weight{baselineLb === null && " and a current weight"} in{" "}
              <Link href="/profile" className="underline">Profile</Link>
              {baselineLb === null && " (or add a weigh-in below)"} and the
              countdown starts.
            </Empty>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-display text-4xl text-primary">
                    {burn.remainingKcal.toLocaleString()}
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    kcal left of {burn.totalKcal.toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {baselineLb} → {goalLb} lb
                </div>
              </div>
              <BurnDownBar
                totalKcal={burn.totalKcal}
                byCaloriesKcal={burn.burnedByCaloriesKcal}
                byScaleKcal={burn.burnedByScaleKcal}
              />
              <div className="space-y-1 text-sm">
                <p>
                  Calories say <strong className="text-primary">{burn.lbByCalories} lb</strong> gone
                  ({burn.burnedByCaloriesKcal.toLocaleString()} kcal banked).
                </p>
                {burn.lbByScale !== null ? (
                  <>
                    <p>
                      The scale says <strong className="text-primary">{burn.lbByScale} lb</strong>
                      {energy.trendLbPerWeek !== null &&
                        ` — trending ${Math.abs(energy.trendLbPerWeek)} lb/week ${energy.trendLbPerWeek <= 0 ? "down" : "up"}`}
                      .
                    </p>
                    {burn.gapKcal !== null && Math.abs(burn.gapKcal) > KCAL_PER_LB && (
                      <p className="text-muted-foreground">
                        They differ by {Math.abs(burn.gapKcal).toLocaleString()} kcal — the
                        maintenance estimate is likely {burn.gapKcal > 0 ? "too low" : "too high"}.
                        {energy.maintenance.source === "implied" &&
                          ` The app is already correcting from your data: ${energy.maintenance.value!.toLocaleString()}/day is in force.`}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    Weigh in weekly below and a second line appears — the scale&apos;s
                    version of the same story.
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 2 — Weigh in */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Weigh in
            <InfoTip>
              Once a week is plenty — same day, same conditions. The scale is
              what keeps the calorie math honest. Saving the same date again
              replaces that day&apos;s reading.
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WeightCard today={today} entries={weighIns} />
        </CardContent>
      </Card>

      {/* 3 — Weekly wins */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Weekly wins
            <InfoTip>
              A week is a win when you eat at or under the bank plus your
              tolerance (±{tolerance.toLocaleString()} kcal). The chip shows how
              tight it was. A week with unlogged days isn&apos;t scored — an
              unknown day is not a zero-calorie day. The running week is
              measured pro-rata and joins the streak when it closes.
            </InfoTip>
            {streak > 0 && (
              <Badge className="ml-auto">
                {streak} win{streak === 1 ? "" : "s"} in a row
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bank === null ? (
            <Empty>
              Set a weekly calorie bank in{" "}
              <Link href="/profile" className="underline">Profile</Link> and weeks
              start scoring.
            </Empty>
          ) : (
            <WeeklyWins
              rows={[...weeks].reverse().map((w) => ({
                label: rangeShort(w.weekOf, w.weekEnd),
                delta: w.bankDelta,
                consumed: w.consumedKcal,
                bank: w.bankSoFarKcal,
                band: w.band,
                isWin: w.inProgress ? null : w.isWin,
                avgPerDay: w.avgKcalPerLoggedDay,
                loggedDays: w.loggedDays,
                elapsedDays: w.elapsedDays,
                untrackedDays: w.untrackedDays,
                inProgress: w.inProgress,
              }))}
            />
          )}
        </CardContent>
      </Card>

      {/* 4 — Weight over time */}
      {weighIns.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Weight</CardTitle>
          </CardHeader>
          <CardContent>
            <WeightChart points={weighIns} goalLb={goalLb} />
          </CardContent>
        </Card>
      )}

      {/* 5 — The week in progress, day by day */}
      {current && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              This week, day by day
              <InfoTip>
                A big day is fine as long as the week holds — that&apos;s the whole
                point of banking calories weekly instead of daily.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyChart
              rate={dailyRate(bank, 7)}
              days={dailyTotals(current.days, current.entries).map((d) => ({
                label: shortDay(d.date),
                kcal: d.kcal,
                logged: d.logged,
                isToday: d.date === today,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* 6 — Protein, one honest sentence */}
      {lastFinished?.proteinPerLoggedDay != null && lastFinished.proteinPerLoggedDay > 0 && (
        <p className="text-sm text-muted-foreground">
          Protein: last week you averaged{" "}
          <strong className="text-foreground">{lastFinished.proteinPerLoggedDay} g/day</strong>
          {profile?.proteinLowGDay != null && (
            <>
              {" "}against your {profile.proteinLowGDay}
              {profile.proteinHighGDay != null && `–${profile.proteinHighGDay}`} g target
            </>
          )}
          .
        </p>
      )}

      {/* 7 — The maintenance number in force */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Maintenance
            <InfoTip>
              What you burn per day — the number deficits are measured against.
              It updates itself: from your vitals at first, then from what your
              logs and weigh-ins prove. Pin your own number in Profile if you
              disagree. Your bank never moves on its own.
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {energy.maintenance.value === null ? (
            <Empty>
              Fill in sex, age, height, weight and activity in{" "}
              <Link href="/profile" className="underline">Profile</Link> and a
              maintenance estimate appears.
            </Empty>
          ) : (
            <>
              <p>
                <span className="font-display text-2xl text-primary">
                  {energy.maintenance.value.toLocaleString()}
                </span>{" "}
                <span className="text-muted-foreground">
                  kcal/day — {sourceLabel(energy.maintenance.source!)}
                </span>
              </p>
              {bank !== null && (
                <p className="text-muted-foreground">
                  Your {bank.toLocaleString()} bank is ~{Math.round(bank / 7).toLocaleString()}/day:
                  a {Math.abs(energy.maintenance.value - Math.round(bank / 7)).toLocaleString()}{" "}
                  kcal/day {energy.maintenance.value >= Math.round(bank / 7) ? "deficit" : "surplus"},
                  worth ~{Math.abs(Math.round((((energy.maintenance.value - Math.round(bank / 7)) * 7) / KCAL_PER_LB) * 10) / 10)}{" "}
                  lb/week if the estimate is right.
                </p>
              )}
              {energy.maintenance.source === "formula" && (
                <p className="text-muted-foreground">
                  After ~2 weeks of solid logging with weigh-ins at both ends, this
                  switches to the number your own data implies.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {weeks.length} week{weeks.length === 1 ? "" : "s"} · {totalLogged} day
        {totalLogged === 1 ? "" : "s"} logged
        {totalDeficit !== 0 &&
          ` · ${Math.abs(totalDeficit).toLocaleString()} kcal ${totalDeficit > 0 ? "deficit" : "surplus"} banked`}
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-2xl">
        Progress
        <InfoTip>
          The whole game on one page: stack weekly wins, watch the calorie
          debt to your goal weight fall, and check the scale agrees. Charts
          only count days you logged — a half-logged week reads as
          half-logged, never as a giant deficit.
        </InfoTip>
      </h1>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function sourceLabel(source: "manual" | "implied" | "formula"): string {
  switch (source) {
    case "manual":
      return "pinned by you in Profile";
    case "implied":
      return "implied by your own logs and weigh-ins";
    case "formula":
      return "estimated from your vitals (Mifflin-St Jeor × activity)";
  }
}

function nearestWeighIn(weighIns: { date: string; weightLb: number }[], to: string): number | null {
  if (weighIns.length === 0) return null;
  let best = weighIns[0];
  let bestGap = Math.abs(Date.parse(best.date) - Date.parse(to));
  for (const w of weighIns) {
    const gap = Math.abs(Date.parse(w.date) - Date.parse(to));
    if (gap < bestGap) {
      best = w;
      bestGap = gap;
    }
  }
  return best.weightLb;
}

function rangeShort(from: string, to: string): string {
  const f = new Date(from + "T12:00:00Z");
  const t = new Date(to + "T12:00:00Z");
  const sameMonth = f.getUTCMonth() === t.getUTCMonth();
  const fmt = (d: Date, withMonth: boolean) =>
    withMonth
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      : d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  return `${fmt(f, true)}–${fmt(t, !sameMonth)}`;
}

function shortDay(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", timeZone: "UTC",
  });
}
