import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { localDateKey } from "@/lib/dates";
import { getFoodLogForWeek, getWeekFull, todayIso } from "@/lib/queries";
import { weekTotals } from "@/lib/weekmath";
import { asPlainText, groupByDepartment } from "@/lib/shopping";
import { CopyButton } from "@/components/copy-button";
import { WeekStepper } from "@/components/week-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rangeLabel, relativeLabel, type WeekStatus, displayStatus } from "@/lib/weeks";

export const dynamic = "force-dynamic";

// A read-only record of one week: the plan it held and the list it produced.
// List items and week staples are value copies, so editing a recipe later
// never rewrites what this week actually was.
export default async function WeekArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const week = await getWeekFull(user.id, id);
  if (!week) notFound();

  // The diary lives on the user, so read it by this week's dates.
  const foodLog = await getFoodLogForWeek(user.id, week.weekOf, week.dayCount);

  const today = await todayIso();
  const weekOf = week.weekOf.toISOString().slice(0, 10);
  const status = week.status as WeekStatus;
  const shown = displayStatus(week, today);
  const totals = weekTotals(
    week.recipes.map((wr) => ({
      name: wr.recipe.name,
      portions: wr.portions,
      kcalPerServing: wr.recipe.kcalPerServing,
      proteinG: wr.recipe.proteinG,
    })),
    week.staples.map((ws) => ({ name: ws.name, qty: ws.qty, kcal: ws.kcal, proteinG: ws.proteinG })),
    {
      budgetKcal: week.budgetKcal,
      proteinLowGDay: week.proteinLowGDay,
      proteinHighGDay: week.proteinHighGDay,
    },
  );

  const needItems = week.listItems.filter((i) => i.status === "need");
  const needGroups = groupByDepartment(needItems);
  const consumed = foodLog.reduce((sum, e) => sum + e.kcal, 0);
  const loggedDays = new Set(foodLog.map((e) => e.date.toISOString().slice(0, 10))).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl">{rangeLabel(weekOf, week.dayCount)}</h1>
          <p className="text-sm text-muted-foreground">
            {relativeLabel(weekOf, week.dayCount, today)}
            {week.dayCount < 7 && ` · ${week.dayCount}-day week`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={shown === "done" || shown === "closed" ? "outline" : "default"}>{shown}</Badge>
          <Button asChild variant="outline" size="sm">
            <Link href={`/week?w=${week.id}`}>Open this week</Link>
          </Button>
        </div>
      </div>

      <WeekStepper status={status} />

      <Card>
        <CardHeader><CardTitle>How it went</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            Planned <strong className="text-primary">{totals.totalKcal.toLocaleString()}</strong>
            {week.budgetKcal !== null && <> of {week.budgetKcal.toLocaleString()}</>} kcal
            {" "}(recipes {totals.recipeKcal.toLocaleString()} + staples {totals.stapleKcal.toLocaleString()})
          </p>
          <p className="text-muted-foreground">
            Protein planned: {totals.totalProtein} g (~{totals.proteinPerDay} g/day)
          </p>
          {foodLog.length > 0 ? (
            <p>
              Actually logged <strong className="text-primary">{consumed.toLocaleString()}</strong> kcal
              across {loggedDays} day{loggedDays === 1 ? "" : "s"}
              {week.budgetKcal !== null && (
                <> — {week.budgetKcal - consumed >= 0
                  ? `${(week.budgetKcal - consumed).toLocaleString()} under the bank`
                  : `${(consumed - week.budgetKcal).toLocaleString()} over the bank`}</>
              )}
            </p>
          ) : (
            <p className="text-muted-foreground">Nothing was logged this week.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>The plan</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {week.recipes.length === 0 && week.staples.length === 0 && (
            <p className="text-muted-foreground">Nothing was planned.</p>
          )}
          {week.recipes.map((wr) => (
            <p key={wr.id}>
              {wr.recipe.name} — {wr.portions} portions × {wr.recipe.kcalPerServing} kcal
            </p>
          ))}
          {week.staples.length > 0 && (
            <>
              <p className="pt-2 font-medium">Staples</p>
              {week.staples.map((ws) => (
                <p key={ws.id}>
                  {ws.name} × {ws.qty}
                  {ws.kcal !== null && ` (${ws.kcal} kcal each)`}
                </p>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The shopping list</CardTitle>
          {needItems.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {needItems.length} item{needItems.length === 1 ? "" : "s"}
              {week.listFinalizedAt && ` · saved ${localDateKey(week.listFinalizedAt)}`}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {needItems.length === 0 ? (
            <p className="text-muted-foreground">
              No list was produced for this week.
            </p>
          ) : (
            <>
              {needGroups.map((group) => (
                <div key={group.department}>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.department}
                  </div>
                  {group.items.map((item) => (
                    <p key={item.id}>
                      {item.qty !== null && `${String(Number(item.qty.toFixed(2)))} ${item.unit} `}
                      {item.name}
                    </p>
                  ))}
                </div>
              ))}
              <CopyButton text={asPlainText(needGroups, totals.totalKcal)} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
