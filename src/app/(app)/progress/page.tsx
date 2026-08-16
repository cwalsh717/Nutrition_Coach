import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getEnergyStatus, todayIso } from "@/lib/queries";
import {
  calendarWeeks, cumulativeDeficit, dailyRate, dailyTotals, latestLoggedWeek,
  verdictFor, winsRows, winStreak, type DiaryEntry,
} from "@/lib/progress";
import {
  formulaMaintenance, goalProgress, impliedWindowProgress, KCAL_PER_LB,
  steadiness,
} from "@/lib/energy";
import { MAINTAIN_BAND_LB, resolveGoal, weightForWeek } from "@/lib/goal";
import type { Activity, Sex } from "@/lib/targets";
import { DailyChart, GoalRaceBar, WeeklyWins, WeightChart } from "@/components/charts";
import { WeightCard } from "@/components/weight-card";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

// Progress runs on plain calendar weeks read off the food diary — never on
// week plans — and every card degrades on its own: weigh-ins render without
// food logs, food logs render without weigh-ins, and nothing on this page
// scores an unknown day as if it were a zero.
export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ wins?: string }>;
}) {
  const user = await requireUser();
  const [today, { wins }] = await Promise.all([todayIso(), searchParams]);

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
  const untracked = new Set(untrackedRows.map((u) => u.date.toISOString().slice(0, 10)));
  const loggedDates = new Set(entries.map((e) => e.date));

  const bank = profile?.weeklyKcalBudget ?? null;
  const tolerance = energy.bankToleranceKcal;

  // One resolution of "which way is good" drives the whole page.
  const goal = resolveGoal({
    goalType: profile?.goalType ?? null,
    goalWeightLb: profile?.goalWeightLb ?? null,
    baselineLb: weighIns[0]?.weightLb ?? profile?.weightLb ?? null,
    latestLb: energy.latestWeightLb,
  });

  // Score each week with the maintenance that was true while it ran: a
  // manual pin or the data-implied number applies everywhere, but formula
  // maintenance follows the last scale reading the week could have known.
  const weeks = calendarWeeks(entries, today, untracked).map((week) => {
    let maintenanceKcal = energy.maintenance.value;
    if (
      energy.maintenance.source === "formula" &&
      profile?.sex && profile.age && profile.heightIn && profile.activityLevel
    ) {
      const lb = weightForWeek(weighIns, week.weekEnd) ?? profile.weightLb;
      if (lb !== null) {
        maintenanceKcal = formulaMaintenance(
          { sex: profile.sex as Sex, age: profile.age, heightIn: profile.heightIn, weightLb: lb },
          profile.activityLevel as Activity,
        );
      }
    }
    return verdictFor(week, {
      bankKcal: bank,
      toleranceKcal: tolerance,
      maintenanceKcal,
      direction: goal.direction,
    });
  });

  const streak = winStreak(weeks);
  const totalDeficit = cumulativeDeficit(weeks);
  const loggedWeeks = weeks.filter((w) => w.loggedDays > 0);
  const totalLogged = weeks.reduce((sum, w) => sum + w.loggedDays, 0);
  const focusWeek = latestLoggedWeek(weeks);
  const lastFinished = [...weeks].reverse().find((w) => !w.inProgress && w.loggedDays > 0) ?? null;

  const { rows, olderCount } = winsRows(weeks, {
    maxWeeks: wins === "all" ? Number.MAX_SAFE_INTEGER : 12,
  });

  const race =
    goal.direction !== "maintain" && goal.goalLb !== null && goal.baselineLb !== null && !goal.reached
      ? goalProgress({
          direction: goal.direction,
          baselineLb: goal.baselineLb,
          goalLb: goal.goalLb,
          cumulativeDeficitKcal: totalDeficit,
          // One weigh-in can't measure change; the scale line needs two.
          latestLb: weighIns.length > 1 ? energy.latestWeightLb : null,
        })
      : null;
  const steady =
    goal.direction === "maintain" && goal.baselineLb !== null
      ? steadiness({ baselineLb: goal.baselineLb, latestLb: energy.latestWeightLb, bandLb: MAINTAIN_BAND_LB })
      : null;

  // Show the trend only once the readings span two weeks — before that a
  // slope is water weight cosplaying as fate.
  const trend = energy.weighInSpanDays >= 14 ? energy.trendLbPerWeek : null;

  // When the calorie line and the scale line disagree, name the likeliest
  // culprit honestly: patchy logging beats a bad maintenance estimate.
  const daysSinceBaseline =
    weighIns.length > 0
      ? Math.round((Date.parse(today) - Date.parse(weighIns[0].date)) / 86_400_000) + 1
      : 0;
  const coverageSinceBaseline = daysSinceBaseline > 0 ? totalLogged / daysSinceBaseline : 1;

  const impliedMeter = impliedWindowProgress(
    weighIns.map((w) => w.date),
    loggedDates,
    untracked,
  );

  if (entries.length === 0 && weighIns.length === 0) {
    return (
      <Shell>
        <Empty>
          Nothing here yet. Log a day on{" "}
          <Link href="/track" className="underline">Track</Link> or save a
          weigh-in below — either one starts this page.
        </Empty>
        <Card>
          <CardHeader><CardTitle>Weigh in</CardTitle></CardHeader>
          <CardContent><WeightCard today={today} entries={weighIns} /></CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* 1 — The goal, measured two independent ways */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {goal.direction === "maintain" ? "Holding steady" : "The goal"}
            <InfoTip>
              {goal.direction === "maintain" ? (
                <>Maintenance is a target too: stay within ±{MAINTAIN_BAND_LB} lb
                of your baseline and within your bank's tolerance each week.</>
              ) : (
                <>A pound is worth ~{KCAL_PER_LB.toLocaleString()} kcal, so your
                goal is a fixed amount of energy to {goal.direction === "lose" ? "burn" : "bank"}.
                The scale line is the audit: when it disagrees with the calorie
                line, one of the inputs — often log coverage — is off.</>
              )}
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {goal.mismatch && (
            <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Your profile says <em>{profile?.goalType}</em>, but your goal weight
              ({goal.goalLb} lb) is {goal.direction === "gain" ? "above" : "below"} your
              current weight — so everything here reads as {goal.direction}ing.
              If that&apos;s stale, update{" "}
              <Link href="/profile" className="underline">Profile</Link>.
            </p>
          )}

          {goal.direction === "maintain" ? (
            steady === null ? (
              <Empty>
                Add a weigh-in below (or a weight in{" "}
                <Link href="/profile" className="underline">Profile</Link>) and the
                steadiness view starts.
              </Empty>
            ) : (
              <div className="space-y-1 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-display text-4xl text-primary">
                    {steady.deviationLb === null
                      ? "—"
                      : `${steady.deviationLb > 0 ? "+" : ""}${steady.deviationLb} lb`}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    vs your {steady.baselineLb} lb baseline · band ±{steady.bandLb} lb
                  </span>
                </div>
                {steady.withinBand !== null && (
                  <p className={steady.withinBand ? "text-primary" : "text-destructive"}>
                    {steady.withinBand
                      ? "Inside the band. That's the whole job — keep doing this."
                      : "Outside the band — worth a look at the recent weeks below."}
                  </p>
                )}
                {trend !== null && (
                  <p className="text-muted-foreground">
                    Trending {Math.abs(trend)} lb/week {trend <= 0 ? "down" : "up"}.
                  </p>
                )}
              </div>
            )
          ) : goal.reached && goal.goalLb !== null ? (
            <div className="space-y-1 text-sm">
              <p className="font-display text-3xl text-primary">Goal reached 🎉</p>
              <p>
                {energy.latestWeightLb ?? goal.baselineLb} lb against a {goal.goalLb} lb goal
                {energy.latestWeightLb !== null &&
                  Math.abs(energy.latestWeightLb - goal.goalLb) > 0.5 &&
                  ` — ${Math.abs(Math.round((energy.latestWeightLb - goal.goalLb) * 10) / 10)} lb past it`}
                .
              </p>
              <p className="text-muted-foreground">
                Next move when you&apos;re ready: switch your goal to <em>maintain</em> in{" "}
                <Link href="/profile" className="underline">Profile</Link> and this
                page starts guarding the result instead of chasing it.
              </p>
            </div>
          ) : race === null ? (
            <Empty>
              Set a goal weight{goal.baselineLb === null && " and a current weight"} in{" "}
              <Link href="/profile" className="underline">Profile</Link>
              {goal.baselineLb === null && " (or add a weigh-in below)"} and the
              countdown starts.
            </Empty>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-display text-4xl text-primary">
                    {race.remainingKcal.toLocaleString()}
                  </span>
                  <span className="ml-2 text-sm text-muted-foreground">
                    kcal left of {race.totalKcal.toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {goal.baselineLb} → {goal.goalLb} lb
                  {energy.latestWeightLb !== null && ` · now ${energy.latestWeightLb} lb`}
                </div>
              </div>
              <GoalRaceBar
                totalKcal={race.totalKcal}
                byCaloriesKcal={race.bankedByCaloriesKcal}
                byScaleKcal={race.bankedByScaleKcal}
                direction={race.direction}
              />
              <div className="space-y-1 text-sm">
                <p>
                  Calories say{" "}
                  <strong className={race.lbByCalories >= 0 ? "text-primary" : "text-destructive"}>
                    {Math.abs(race.lbByCalories)} lb {race.lbByCalories >= 0 ? (race.direction === "lose" ? "gone" : "gained") : "the wrong way"}
                  </strong>{" "}
                  ({Math.abs(race.bankedByCaloriesKcal).toLocaleString()} kcal
                  {race.bankedByCaloriesKcal >= 0 ? " banked" : " against you"}).
                </p>
                {race.lbByScale !== null ? (
                  <>
                    <p>
                      The scale says{" "}
                      <strong className={race.lbByScale >= 0 ? "text-primary" : "text-destructive"}>
                        {Math.abs(race.lbByScale)} lb {race.lbByScale >= 0 ? (race.direction === "lose" ? "gone" : "gained") : "the wrong way"}
                      </strong>
                      {trend !== null &&
                        ` — trending ${Math.abs(trend)} lb/week ${trend <= 0 ? "down" : "up"}`}
                      {trend === null && energy.weighInSpanDays > 0 &&
                        ` — trend appears after two weeks of weigh-ins (${energy.weighInSpanDays} day${energy.weighInSpanDays === 1 ? "" : "s"} so far)`}
                      .
                    </p>
                    {race.gapKcal !== null && Math.abs(race.gapKcal) >= 3 * KCAL_PER_LB && (
                      <p className="text-muted-foreground">
                        The two lines differ by ~{Math.round(Math.abs(race.gapKcal) / KCAL_PER_LB)} lb.{" "}
                        {coverageSinceBaseline < 0.8
                          ? `The likeliest reason: only ${totalLogged} of ${daysSinceBaseline} days since your first weigh-in are logged — unlogged days hide calories the scale still counts.`
                          : `With your logging this complete, the maintenance estimate is likely ${race.gapKcal > 0 ? "too low" : "too high"}.`}
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
      {entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Weekly wins
              <InfoTip>
                {goal.direction === "lose" && (
                  <>A week is a win when you eat at or under the bank plus your
                  tolerance (±{tolerance.toLocaleString()} kcal).</>
                )}
                {goal.direction === "gain" && (
                  <>Your bank is a floor: a week is a win when you eat at or
                  ABOVE it, minus your tolerance (±{tolerance.toLocaleString()} kcal).
                  Under-eating is the miss.</>
                )}
                {goal.direction === "maintain" && (
                  <>A week is a win when it lands within ±{tolerance.toLocaleString()} kcal
                  of the bank — either side of the line is drift.</>
                )}{" "}
                A week with unknown days isn&apos;t scored — an unlogged day is not
                a zero-calorie day. Days marked not-tracked don&apos;t count against
                you. The bar scale is fixed: a full bar is one pound.
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
                direction={goal.direction}
                olderCount={olderCount}
                showAllHref="/progress?wins=all"
                rows={rows.map((row) => ({
                  row,
                  label:
                    row.kind === "week" || row.kind === "off-week"
                      ? rangeShort(row.week.weekOf, row.week.weekEnd, today)
                      : row.kind === "gap"
                        ? rangeShort(row.from, row.to, today)
                        : "",
                }))}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* 4 — Weight over time */}
      {weighIns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              Weight
              {goal.goalLb !== null && goal.direction !== "maintain" && (
                <span className="ml-auto text-sm font-normal text-muted-foreground">
                  {goal.goalLb} lb goal
                  {energy.latestWeightLb !== null &&
                    ` · ${Math.abs(Math.round((energy.latestWeightLb - goal.goalLb) * 10) / 10)} lb to go`}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {weighIns.length === 1 ? (
              <p className="text-sm text-muted-foreground">
                First reading saved: {weighIns[0].weightLb} lb. One more weigh-in
                draws the line.
              </p>
            ) : (
              <WeightChart
                points={weighIns}
                goalLb={goal.direction === "maintain" ? null : goal.goalLb}
                band={
                  steady !== null
                    ? { centerLb: steady.baselineLb, halfLb: steady.bandLb }
                    : undefined
                }
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* 5 — The most recent week with data, day by day */}
      {focusWeek && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {focusWeek.inProgress
                ? "This week, day by day"
                : `Week of ${rangeShort(focusWeek.weekOf, focusWeek.weekEnd, today)}, day by day`}
              <InfoTip>
                A big day is fine as long as the week holds — that&apos;s the whole
                point of banking calories weekly instead of daily. Dashed
                outlines are unlogged days: unknown, not zero.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DailyChart
              rate={dailyRate(bank, 7)}
              days={dailyTotals(focusWeek.days, focusWeek.entries, { today, untracked }).map((d) => ({
                label: shortDay(d.date),
                kcal: d.kcal,
                state: d.state,
                isToday: d.date === today,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* 6 — Protein, one honest sentence */}
      {lastFinished?.proteinPerLoggedDay != null && (
        <p className="text-sm text-muted-foreground">
          Protein: over the week of {rangeShort(lastFinished.weekOf, lastFinished.weekEnd, today)} you
          averaged{" "}
          <strong className="text-foreground">{lastFinished.proteinPerLoggedDay} g/day</strong>
          {profile?.proteinLowGDay != null && (
            <>
              {" "}against your {profile.proteinLowGDay}
              {profile.proteinHighGDay != null && `–${profile.proteinHighGDay}`} g target
            </>
          )}
          {lastFinished.proteinDays < lastFinished.loggedDays &&
            ` (counting the ${lastFinished.proteinDays} day${lastFinished.proteinDays === 1 ? "" : "s"} with complete protein data)`}
          .
        </p>
      )}

      {/* 7 — The maintenance number in force */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Maintenance
            <InfoTip>
              What you burn per day — the number every deficit or surplus is
              measured against. It updates itself: from your vitals at first,
              then from what your logs and weigh-ins prove. Pin your own number
              in Profile if you disagree. Your bank never moves on its own.
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
              {energy.maintenance.source === "manual" && energy.impliedKcal !== null &&
                energy.impliedKcal !== energy.maintenance.value && (
                <p className="text-muted-foreground">
                  For what it&apos;s worth, your own logs and weigh-ins imply{" "}
                  {energy.impliedKcal.toLocaleString()} kcal/day — clear the pin in
                  Profile to use it.
                </p>
              )}
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
                  {impliedMeter.bestRunDays > 0 ? (
                    <>
                      Your own data takes over after {impliedMeter.requiredDays} straight
                      fully-logged days between two weigh-ins — longest run so far:{" "}
                      <strong className="text-foreground">
                        {impliedMeter.bestRunDays} of {impliedMeter.requiredDays}
                      </strong>
                      . A missed day restarts the run; a not-tracked day pauses the streak
                      without lying about it.
                    </>
                  ) : (
                    <>
                      This switches to the number your own data implies once you have{" "}
                      {impliedMeter.requiredDays} straight fully-logged days starting on a
                      weigh-in day and ending on one.
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        {loggedWeeks.length} week{loggedWeeks.length === 1 ? "" : "s"} with logging ·{" "}
        {totalLogged} day{totalLogged === 1 ? "" : "s"} logged
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
          The whole game on one page: stack weekly wins, watch the distance to
          your goal close, and check the scale agrees. Every number counts only
          days you actually logged — an unknown day is never a zero.
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

/** "Jul 26–Aug 1", with the year added when it isn't this year's. */
function rangeShort(from: string, to: string, today: string): string {
  const f = new Date(from + "T12:00:00Z");
  const t = new Date(to + "T12:00:00Z");
  const sameMonth = f.getUTCMonth() === t.getUTCMonth();
  const fmt = (d: Date, withMonth: boolean) =>
    withMonth
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      : d.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  const year = to.slice(0, 4) === today.slice(0, 4) ? "" : ` ${to.slice(0, 4)}`;
  return `${fmt(f, true)}–${fmt(t, !sameMonth)}${year}`;
}

function shortDay(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", timeZone: "UTC",
  });
}
