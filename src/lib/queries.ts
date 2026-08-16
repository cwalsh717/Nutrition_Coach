import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import { localDateKey } from "./dates";
import { diaryTotals, weekTotals } from "./weekmath";
import type { CandidateRow } from "./shopping";
import { currentWeek, defaultWeek, tabOrder, weekEnd, type WeekStatus } from "./weeks";
import {
  effectiveMaintenance, formulaMaintenance, impliedMaintenance, impliedWindow,
  weighInSpanDays, weightTrendLbPerWeek, type EffectiveMaintenance, type WeighIn,
} from "./energy";
import type { Activity, Sex } from "./targets";

/**
 * Today as a date key in the USER'S timezone, read from the cookie the
 * browser sets on first load (components/timezone-sync.tsx). Every "which
 * week am I in" decision derives from this. Falls back to the server clock
 * only when the cookie hasn't landed yet.
 */
export async function todayIso(): Promise<string> {
  const jar = await cookies();
  const zone = jar.get("tz")?.value;
  return localDateKey(new Date(), zone ? decodeURIComponent(zone) : undefined);
}

/** Every week the user has, in tab order (soonest first). */
export async function listWeeks(userId: string) {
  const weeks = await db.week.findMany({
    where: { userId },
    orderBy: { weekOf: "asc" },
    select: { id: true, weekOf: true, dayCount: true, status: true },
  });
  return tabOrder(
    weeks.map((w) => ({
      id: w.id,
      weekOf: w.weekOf.toISOString().slice(0, 10),
      dayCount: w.dayCount,
      status: w.status as WeekStatus,
    })),
  );
}

/** One week by id, scoped to its owner so an id from a URL can't leak data. */
export function getWeekFull(userId: string, weekId: string) {
  return db.week.findFirst({
    where: { id: weekId, userId },
    include: {
      recipes: {
        include: { recipe: { include: { ingredients: true } } },
        orderBy: { id: "asc" },
      },
      staples: { orderBy: { name: "asc" } },
      listItems: { orderBy: { sortOrder: "asc" } },
    },
  });
}

/**
 * Which week a page should show. Honours an explicit ?w= selection, otherwise
 * opens the week covering today, then the soonest upcoming, then the latest.
 */
export async function resolveWeek(userId: string, requestedId?: string) {
  if (requestedId) {
    const asked = await getWeekFull(userId, requestedId);
    if (asked) return asked;
  }
  const summaries = await listWeeks(userId);
  const pick = defaultWeek(summaries, await todayIso());
  return pick ? getWeekFull(userId, pick.id) : null;
}

/** Diary entries for a date range. The log is the user's, not a week's. */
export function getFoodLog(userId: string, fromIso: string, toIso: string) {
  return db.foodLogEntry.findMany({
    where: {
      userId,
      date: { gte: new Date(fromIso + "T00:00:00Z"), lte: new Date(toIso + "T00:00:00Z") },
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
}

/** Whatever a week's dates cover — used for a week's own actual-vs-plan math. */
export function getFoodLogForWeek(userId: string, weekOf: Date, dayCount: number) {
  const start = weekOf.toISOString().slice(0, 10);
  return getFoodLog(userId, start, weekEnd(start, dayCount));
}

export interface EnergyStatus {
  maintenance: EffectiveMaintenance;
  /** The three candidates, so the UI can say where the number came from. */
  manualKcal: number | null;
  impliedKcal: number | null;
  formulaKcal: number | null;
  weighIns: WeighIn[];
  latestWeightLb: number | null;
  trendLbPerWeek: number | null;
  /** Calendar days between first and last weigh-in — gates trend display. */
  weighInSpanDays: number;
  bankToleranceKcal: number;
}

/**
 * The user's whole energy picture: every weigh-in, plus the maintenance
 * number in force and where it came from. Manual pin > implied-by-the-data >
 * formula — the auto-update the owner asked for lives in that ordering, not
 * in ever writing to the profile.
 */
export async function getEnergyStatus(userId: string): Promise<EnergyStatus> {
  const [profile, weightRows] = await Promise.all([
    db.profile.findUnique({ where: { userId } }),
    db.weightEntry.findMany({ where: { userId }, orderBy: { date: "asc" } }),
  ]);

  const weighIns: WeighIn[] = weightRows.map((w) => ({
    date: w.date.toISOString().slice(0, 10),
    weightLb: w.weightLb,
  }));
  const latest = weighIns.at(-1) ?? null;

  // Formula maintenance runs on the LATEST scale reading (falling back to the
  // profile vital), so it tracks the body it's estimating.
  const weightForFormula = latest?.weightLb ?? profile?.weightLb ?? null;
  const formulaKcal =
    profile?.sex && profile.age && profile.heightIn && weightForFormula && profile.activityLevel
      ? formulaMaintenance(
          {
            sex: profile.sex as Sex,
            age: profile.age,
            heightIn: profile.heightIn,
            weightLb: weightForFormula,
          },
          profile.activityLevel as Activity,
        )
      : null;

  // Implied maintenance runs only on a stretch of CONSECUTIVE logged days
  // bracketed by weigh-ins. An empty day is unknown and a not-tracked day is
  // out of scope — either one breaks the stretch instead of being averaged in.
  let impliedKcal: number | null = null;
  if (weighIns.length >= 2) {
    const [log, untrackedRows] = await Promise.all([
      getFoodLog(userId, weighIns[0].date, weighIns.at(-1)!.date),
      db.untrackedDay.findMany({ where: { userId }, select: { date: true } }),
    ]);
    const loggedDates = new Set(log.map((e) => e.date.toISOString().slice(0, 10)));
    const untrackedDates = new Set(untrackedRows.map((u) => u.date.toISOString().slice(0, 10)));

    const window = impliedWindow(weighIns.map((w) => w.date), loggedDates, untrackedDates);
    if (window) {
      // Weigh-ins read as morning-of, so intake counts from the first
      // weigh-in day up to (not including) the last: N days of eating
      // between two scale readings N days apart.
      const eatingDays = new Set(window.days.slice(0, -1));
      const byWeight = new Map(weighIns.map((w) => [w.date, w.weightLb]));
      impliedKcal = impliedMaintenance({
        consumedKcal: log
          .filter((e) => eatingDays.has(e.date.toISOString().slice(0, 10)))
          .reduce((sum, e) => sum + e.kcal, 0),
        days: eatingDays.size,
        lbChange: byWeight.get(window.end)! - byWeight.get(window.start)!,
      });
    }
  }

  const manualKcal = profile?.maintenanceKcal ?? null;

  return {
    maintenance: effectiveMaintenance({ manual: manualKcal, implied: impliedKcal, formula: formulaKcal }),
    manualKcal,
    impliedKcal,
    formulaKcal,
    weighIns,
    latestWeightLb: latest?.weightLb ?? null,
    trendLbPerWeek: weightTrendLbPerWeek(weighIns),
    weighInSpanDays: weighInSpanDays(weighIns),
    bankToleranceKcal: profile?.bankToleranceKcal ?? 500,
  };
}

/** The week you're actually eating right now — used for plan context, not the diary. */
export async function getCurrentWeekFull(userId: string) {
  const summaries = await listWeeks(userId);
  const now = currentWeek(summaries, await todayIso());
  return now ? getWeekFull(userId, now.id) : null;
}

export type WeekFull = NonNullable<Awaited<ReturnType<typeof getWeekFull>>>;
/** Kept as the old name so existing call sites stay readable. */
export type ActiveWeekFull = WeekFull;

/** Math inputs from a loaded week — shared by the week page, list page, and coach. */
export function computeWeekTotals(week: ActiveWeekFull) {
  return weekTotals(
    week.recipes.map((wr) => ({
      name: wr.recipe.name,
      portions: wr.portions,
      kcalPerServing: wr.recipe.kcalPerServing,
      proteinG: wr.recipe.proteinG,
    })),
    week.staples.map((ws) => ({
      name: ws.name,
      qty: ws.qty,
      kcal: ws.kcal,
      proteinG: ws.proteinG,
    })),
    {
      budgetKcal: week.budgetKcal,
      proteinLowGDay: week.proteinLowGDay,
      proteinHighGDay: week.proteinHighGDay,
    },
  );
}

/** Scaled candidate rows for the shopping list builder. */
export function candidateRows(week: ActiveWeekFull): CandidateRow[] {
  const rows: CandidateRow[] = [];
  for (const wr of week.recipes) {
    const scale = wr.recipe.servings ? wr.portions / wr.recipe.servings : 1;
    for (const ing of wr.recipe.ingredients ?? []) {
      rows.push({
        name: ing.name,
        qty: ing.qty === null ? null : ing.qty * scale,
        unit: ing.unit,
        department: ing.department,
        source: wr.recipe.name,
        likelyHave: ing.stapleHint,
      });
    }
  }
  for (const ws of week.staples) {
    rows.push({
      name: ws.name,
      qty: ws.qty,
      unit: "",
      department: ws.department,
      source: "staple",
      likelyHave: false, // the user explicitly chose it for this week
    });
  }
  return rows;
}

/** Plain-text week state for the coach's system prompt. */
export function buildWeekStateSection(
  week: ActiveWeekFull,
  diary: { date: Date; kcal: number; proteinG: number | null }[],
): string {
  const totals = computeWeekTotals(week);
  const lines: string[] = [
    `Week of ${week.weekOf.toISOString().slice(0, 10)} (status: ${week.status}).`,
    "",
    "Planned recipes:",
  ];
  if (week.recipes.length === 0) lines.push("  (none yet)");
  for (const wr of week.recipes) {
    lines.push(
      `  - ${wr.recipe.name}: ${wr.portions} portions x ${wr.recipe.kcalPerServing} kcal, ${wr.recipe.proteinG} g protein/portion`,
    );
  }
  lines.push("", "Staples/fillers this week:");
  if (week.staples.length === 0) lines.push("  (none yet)");
  for (const ws of week.staples) {
    const macros = ws.kcal === null ? "no macro data" : `${ws.kcal} kcal, ${ws.proteinG ?? 0} g protein each`;
    lines.push(`  - ${ws.name}: ${ws.qty}/week (${macros})`);
  }

  lines.push("");
  if (week.budgetKcal !== null) {
    lines.push(
      `Calorie bank: recipes ${totals.recipeKcal} + staples ${totals.stapleKcal} = ${totals.totalKcal} of ${week.budgetKcal} kcal planned (${totals.bankGap} kcal unfilled).`,
    );
  } else {
    lines.push(
      `Planned calories: recipes ${totals.recipeKcal} + staples ${totals.stapleKcal} = ${totals.totalKcal} kcal. The user has not set a weekly bank target.`,
    );
  }
  if (week.proteinLowGDay !== null) {
    lines.push(
      `Protein: ${totals.totalProtein} g planned = ~${totals.proteinPerDay} g/day vs their ${week.proteinLowGDay}${week.proteinHighGDay ? `-${week.proteinHighGDay}` : ""} g/day target.`,
    );
  } else {
    lines.push(`Protein planned: ${totals.totalProtein} g (~${totals.proteinPerDay} g/day). No protein target set.`);
  }

  // Shopping list state
  const items = week.listItems;
  if (items.length === 0) {
    lines.push("", "Shopping list: not built yet.");
  } else {
    const need = items.filter((i) => i.status === "need").length;
    const have = items.filter((i) => i.status === "have").length;
    const unreviewed = items.filter((i) => i.status === "unreviewed").length;
    lines.push(
      "",
      `Shopping list: ${items.length} items — ${need} to buy, ${have} already have, ${unreviewed} unreviewed.`,
    );
    if (need > 0) {
      lines.push(
        "To buy: " +
          items
            .filter((i) => i.status === "need")
            .map((i) => i.name)
            .join("; "),
      );
    }
  }

  // Food diary
  if (diary.length > 0) {
    const byDate = new Map<string, { kcal: number; proteinG: number }>();
    for (const entry of diary) {
      const key = entry.date.toISOString().slice(0, 10);
      const day = byDate.get(key) ?? { kcal: 0, proteinG: 0 };
      day.kcal += entry.kcal;
      day.proteinG += entry.proteinG ?? 0;
      byDate.set(key, day);
    }
    lines.push("", "Food diary so far:");
    for (const [date, day] of byDate) {
      lines.push(`  - ${date}: ${day.kcal} kcal, ${day.proteinG} g protein`);
    }
    const soFar = diaryTotals(
      [...byDate.entries()].map(([date, d]) => ({ date, kcal: d.kcal, proteinG: d.proteinG })),
      week.budgetKcal,
    );
    lines.push(
      week.budgetKcal !== null
        ? `Consumed ${soFar.consumedKcal} of ${week.budgetKcal} kcal — ${soFar.bankRemaining} left in the bank.`
        : `Consumed ${soFar.consumedKcal} kcal so far this week.`,
    );
  } else {
    lines.push("", "Food diary: no entries this week.");
  }

  return lines.join("\n");
}

/** The user's longer arc for the coach: deficits banked, streak, the scale. */
export async function buildProgressSection(userId: string): Promise<string> {
  const [profile, energy, logRows] = await Promise.all([
    db.profile.findUnique({ where: { userId } }),
    getEnergyStatus(userId),
    db.foodLogEntry.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      select: { date: true, kcal: true, proteinG: true },
    }),
  ]);
  if (logRows.length === 0) return "Progress: nothing logged yet.";

  const { calendarWeeks, cumulativeDeficit, verdictFor, winStreak } = await import("./progress");
  const { resolveGoal } = await import("./goal");
  const goal = resolveGoal({
    goalType: profile?.goalType ?? null,
    goalWeightLb: profile?.goalWeightLb ?? null,
    baselineLb: energy.weighIns[0]?.weightLb ?? profile?.weightLb ?? null,
    latestLb: energy.latestWeightLb,
  });
  const weeks = calendarWeeks(
    logRows.map((e) => ({
      date: e.date.toISOString().slice(0, 10),
      kcal: e.kcal,
      proteinG: e.proteinG,
    })),
    await todayIso(),
  ).map((w) =>
    verdictFor(w, {
      bankKcal: profile?.weeklyKcalBudget ?? null,
      toleranceKcal: energy.bankToleranceKcal,
      maintenanceKcal: energy.maintenance.value,
      direction: goal.direction,
    }),
  );

  const lines = ["Progress:"];
  if (energy.maintenance.value !== null) {
    lines.push(
      `  Maintenance in force: ${energy.maintenance.value} kcal/day (${energy.maintenance.source}).`,
    );
  }
  const deficit = cumulativeDeficit(weeks);
  lines.push(
    `  Cumulative ${deficit >= 0 ? "deficit" : "surplus"} banked: ${Math.abs(deficit)} kcal (~${Math.abs(Math.round((deficit / 3500) * 10) / 10)} lb).`,
  );
  const streak = winStreak(weeks);
  const winPhrase =
    goal.direction === "gain"
      ? "at or over the bank (a gainer's bank is a floor)"
      : goal.direction === "maintain"
        ? "inside the tolerance band"
        : "at or under the bank";
  lines.push(`  Goal direction: ${goal.direction}.`);
  lines.push(`  Win streak: ${streak} finished week${streak === 1 ? "" : "s"} in a row ${winPhrase}.`);
  if (energy.latestWeightLb !== null) {
    lines.push(
      `  Latest weigh-in: ${energy.latestWeightLb} lb${energy.trendLbPerWeek !== null ? `, trending ${energy.trendLbPerWeek} lb/week` : ""}.`,
    );
  }
  if (profile?.goalWeightLb) lines.push(`  Goal weight: ${profile.goalWeightLb} lb.`);
  return lines.join("\n");
}

/** The user's cookbook summarized for the coach (so it can suggest fits). */
export async function buildCookbookSection(userId: string): Promise<string> {
  const recipes = await db.recipe.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { name: true, slot: true, servings: true, kcalPerServing: true, proteinG: true, keeper: true },
  });
  if (recipes.length === 0) return "Cook Book: empty.";
  const lines = ["Cook Book:"];
  for (const r of recipes) {
    const tag = r.keeper === true ? "keeper" : r.keeper === false ? "retired" : "unrated";
    lines.push(
      `  - ${r.name} [${r.slot}, ${tag}]: ${r.servings} servings, ${r.kcalPerServing} kcal / ${r.proteinG} g protein per serving`,
    );
  }
  return lines.join("\n");
}
