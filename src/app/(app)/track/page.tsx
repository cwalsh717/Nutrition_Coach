import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getFoodLog, listWeeks, todayIso } from "@/lib/queries";
import { Diary, type DiaryEntry, type SavedFood } from "@/components/diary";
import { InfoTip } from "@/components/info-tip";
import { calendarWeekDays, coversDate } from "@/lib/weeks";

export const dynamic = "force-dynamic";

/**
 * The food diary — standalone. It needs a date and nothing else: no week, no
 * plan, no shopping list. A plan is just a plan; what you actually ate is its
 * own record. Navigation runs on plain calendar weeks so it always works.
 *
 * If a plan happens to cover these days, its bank is used as the target;
 * otherwise the profile's weekly target is. Either way you can log.
 */
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const user = await requireUser();
  const { d } = await searchParams;

  const today = await todayIso();
  const focusDate = /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") ? d! : today;
  const days = calendarWeekDays(focusDate);

  const [entries, weeks, profile, untrackedRows] = await Promise.all([
    getFoodLog(user.id, days[0], days[6]),
    listWeeks(user.id),
    db.profile.findUnique({ where: { userId: user.id } }),
    db.untrackedDay.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(days[0] + "T00:00:00Z"), lte: new Date(days[6] + "T00:00:00Z") },
      },
      select: { date: true },
    }),
  ]);
  const untracked = untrackedRows.map((u) => u.date.toISOString().slice(0, 10));

  // A plan overlapping these days lends its numbers; otherwise fall back to
  // the profile. Neither is required.
  const planForThisWeek = weeks.find((w) =>
    days.some((day) => coversDate(w.weekOf, w.dayCount, day)),
  );
  const plan = planForThisWeek
    ? await db.week.findUnique({
        where: { id: planForThisWeek.id },
        select: { budgetKcal: true, proteinLowGDay: true },
      })
    : null;

  const budgetKcal = plan?.budgetKcal ?? profile?.weeklyKcalBudget ?? null;
  const proteinLowGDay = plan?.proteinLowGDay ?? profile?.proteinLowGDay ?? null;

  const diaryEntries: DiaryEntry[] = entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString().slice(0, 10),
    description: e.description,
    kcal: e.kcal,
    proteinG: e.proteinG,
    source: e.source,
  }));

  // Quick Eats first — they're the ones logged on the fly.
  const savedFoods: SavedFood[] = (
    await db.staple.findMany({
      where: { userId: user.id },
      orderBy: [{ kind: "desc" }, { name: "asc" }],
    })
  ).map((f) => ({
    id: f.id,
    name: f.name,
    kind: f.kind,
    kcal: f.kcal,
    proteinG: f.proteinG,
    carbsG: f.carbsG,
    fatG: f.fatG,
    servingNote: f.servingNote,
  }));

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl">
        Track
        <InfoTip>
          What you actually ate, day by day. Independent of planning — log
          whether or not a week is planned. Tap a saved food to log it in one
          go, or type it and let the advisor estimate.
        </InfoTip>
      </h1>
      <Diary
        days={days}
        today={today}
        focusDate={focusDate}
        entries={diaryEntries}
        budgetKcal={budgetKcal}
        proteinLowGDay={proteinLowGDay}
        savedFoods={savedFoods}
        hasPlan={plan !== null}
        untracked={untracked}
      />
    </div>
  );
}
