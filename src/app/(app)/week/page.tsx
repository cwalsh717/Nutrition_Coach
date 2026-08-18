import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { computeWeekTotals, getWeekFull, listWeeks, resolveWeek, todayIso } from "@/lib/queries";
import {
  addRecipeToWeek, deleteWeek, removeRecipeFromWeek, updatePortions, updateWeekDates,
} from "@/actions/weeks";
import { addFoodItem, addManualItem, reconcileWeekList, removeManualItem } from "@/actions/shopping";
import { asPlainText, groupByDepartment } from "@/lib/shopping";
import { CopyButton } from "@/components/copy-button";
import { DepartmentSelect } from "@/components/department-select";
import { InfoTip } from "@/components/info-tip";
import { ListReview, type ReviewItem } from "@/components/list-review";
import { WeekTabs } from "@/components/week-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  displayStatus, freezeReason, isWeekEditable, rangeLabel, relativeLabel, weekEnd,
} from "@/lib/weeks";

export const dynamic = "force-dynamic";

// The Plan surface: one page for the week. The LIST is the hero — it derives
// itself from the recipes (no build/rebuild ceremony), takes anything the user
// wings in by hand, and the bank sits above it as a quiet barometer, never a
// scold. Lifecycle is whatever the tabs and labels already say; the freeze
// (lib/weeks.ts) is the only gate on editing.
export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const user = await requireUser();
  const { w } = await searchParams;
  const [resolved, weeks] = await Promise.all([
    resolveWeek(user.id, w),
    listWeeks(user.id),
  ]);
  let week = resolved;

  // No weeks at all — send them straight to the one thing they can do.
  if (!week) redirect("/week/new");

  const today = await todayIso();

  // The live list: make the derived rows mirror the recipes, then re-read.
  // Frozen weeks skip this entirely — their rows are the shopped snapshot.
  if (isWeekEditable(week, today)) {
    const changed = await reconcileWeekList(week.id);
    if (changed) week = (await getWeekFull(user.id, week.id))!;
  }

  const weekOf = week.weekOf.toISOString().slice(0, 10);
  const totals = computeWeekTotals(week);
  const frozen = freezeReason(week, today);
  const locked = frozen !== null;

  const [mains, fillers, foods, pastWeeks, logDates] = await Promise.all([
    db.recipe.findMany({
      where: { userId: user.id, slot: "main" },
      orderBy: { name: "asc" },
    }),
    db.recipe.findMany({
      where: { userId: user.id, slot: { not: "main" } },
      orderBy: { name: "asc" },
    }),
    // Shopping-tagged foods become one-tap chips on the list.
    db.staple.findMany({
      where: { userId: user.id, kind: "grocery" },
      orderBy: { name: "asc" },
    }),
    db.week.findMany({
      where: { userId: user.id },
      orderBy: { weekOf: "desc" },
      include: { _count: { select: { recipes: true } } },
    }),
    db.foodLogEntry.findMany({ where: { userId: user.id }, select: { date: true } }),
  ]);

  const derivedItems: ReviewItem[] = week.listItems
    .filter((item) => !item.manual)
    .map((item) => ({
      id: item.id,
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      department: item.department,
      sources: item.sources,
      likelyHave: item.likelyHave,
      status: item.status,
    }));
  const manualItems = week.listItems.filter((item) => item.manual);
  const needItems = week.listItems.filter((item) => item.status === "need");
  const needGroups = groupByDepartment(needItems);
  const exportText = asPlainText(needGroups);

  const norm = (s: string) => s.trim().toLowerCase();
  const manualNames = new Set(manualItems.map((item) => norm(item.name)));
  const emptyWeek = week.recipes.length === 0 && manualItems.length === 0;

  return (
    <div className="space-y-6">
      <WeekTabs weeks={weeks} selectedId={week.id} today={today} basePath="/week" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl">{rangeLabel(weekOf, week.dayCount)}</h1>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {relativeLabel(weekOf, week.dayCount, today)}
          {week.dayCount < 7 && ` · ${week.dayCount}-day week`}
          {locked && <Badge variant="outline">{displayStatus(week, today)}</Badge>}
        </span>
      </div>

      {/* The barometer: what's prepped and what the bank is. One quiet reading,
          no ring, no judgment, nothing "left to plan" — the plan doesn't owe
          the bank anything; the diary settles up on Track. */}
      <div className="space-y-0.5 text-sm">
        <p>
          Prepped meals: <strong>~{totals.recipeKcal.toLocaleString()} kcal</strong> planned
          {week.budgetKcal !== null && (
            <span className="text-muted-foreground"> · your bank is {week.budgetKcal.toLocaleString()}</span>
          )}
        </p>
        <p className="text-muted-foreground">
          Protein: ~{totals.proteinPerDay} g/day planned
          {week.proteinLowGDay !== null &&
            ` · target ${week.proteinLowGDay}${week.proteinHighGDay ? `–${week.proteinHighGDay}` : ""} g/day`}
        </p>
      </div>

      {/* Meals */}
      <Card>
        <CardHeader><CardTitle>Meals this week</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {week.recipes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {locked
                ? "Nothing was planned."
                : <>Pick a couple of recipes to prep — their ingredients walk themselves onto
                    the shopping list below. Add mains here or{" "}
                    <Link href="/ingest" className="underline">ingest a new one</Link>.</>}
            </p>
          )}
          {week.recipes.map((wr) => (
            <div key={wr.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <div className="min-w-40 flex-1">
                <div className="font-medium">{wr.recipe.name}</div>
                <div className="text-sm text-muted-foreground">
                  {wr.recipe.kcalPerServing} kcal · {wr.recipe.proteinG} g protein per portion
                  {wr.recipe.slot !== "main" && <Badge variant="secondary" className="ml-2">{wr.recipe.slot}</Badge>}
                </div>
              </div>
              {!locked && (
                <>
                  <form action={async (fd: FormData) => {
                    "use server";
                    await updatePortions(wr.id, Number(fd.get("portions")));
                  }} className="flex items-center gap-1.5">
                    <Input name="portions" inputMode="numeric" defaultValue={wr.portions} className="w-16" />
                    <span className="text-sm text-muted-foreground">portions</span>
                    <Button type="submit" variant="outline" size="sm">Update</Button>
                  </form>
                  <form action={removeRecipeFromWeek.bind(null, wr.id)}>
                    <Button variant="ghost" size="sm" className="text-destructive">Remove</Button>
                  </form>
                </>
              )}
              {locked && (
                <span className="text-sm text-muted-foreground">{wr.portions} portions</span>
              )}
            </div>
          ))}

          {!locked && (
            <div className="flex flex-wrap gap-2 pt-1">
              <AddRecipeForm weekId={week.id} recipes={mains} label="Add a main" />
              <AddRecipeForm weekId={week.id} recipes={fillers} label="Add a filler (breakfast/snack/shake)" />
            </div>
          )}

          {/* Weeks planned before the live-list rework carried staple
              snapshots; they stay readable, nothing more. */}
          {week.staples.length > 0 && (
            <div className="pt-2 text-sm text-muted-foreground">
              <p className="font-medium">Staples (legacy)</p>
              {week.staples.map((ws) => (
                <p key={ws.id}>
                  {ws.name} × {ws.qty}
                  {ws.kcal !== null && ` (${ws.kcal} kcal each)`}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* The review: every derived line waits for the user's Have/Need call. */}
      {!locked && derivedItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Need it, or have it?
              <InfoTip>
                Everything your recipes call for, likely buys on top; things you
                probably keep around (salt, oil, spices) wait at the bottom.
                Nothing is removed for you — you make every call.
              </InfoTip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ListReview weekId={week.id} items={derivedItems} />
          </CardContent>
        </Card>
      )}

      {/* The list — the hero of this page. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {locked ? "The list you shopped" : "Shopping list"}
            <InfoTip>
              Mirrors your recipes on its own — add or remove a meal and the
              ingredients follow. Wing in anything else by name. Grouped in the
              order you walk the store; the copy button formats it for a
              pickup order.
            </InfoTip>
          </CardTitle>
          {needItems.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {needItems.length} item{needItems.length === 1 ? "" : "s"} to buy
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!locked && (
            <>
              {foods.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {foods.map((food) =>
                    manualNames.has(norm(food.name)) ? (
                      <span
                        key={food.id}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-accent px-3 py-1 text-xs text-muted-foreground"
                      >
                        <Check className="size-3" /> {food.name}
                      </span>
                    ) : (
                      <form key={food.id} action={addFoodItem.bind(null, week.id, food.id)}>
                        <button className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-accent">
                          <Plus className="size-3" /> {food.name}
                        </button>
                      </form>
                    ),
                  )}
                </div>
              )}
              <form action={addManualItem.bind(null, week.id)} className="flex flex-wrap gap-2">
                <Input name="name" placeholder="Wing something in — paper towels, limes…" required className="min-w-40 flex-1" />
                <Input name="note" placeholder="note (2 boxes)" className="w-32" />
                <Button type="submit" variant="outline">Add</Button>
              </form>
            </>
          )}

          {needItems.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {locked
                ? "No list was produced for this week."
                : emptyWeek
                  ? "Nothing on the list yet — it fills itself as you plan meals, and takes anything you type above."
                  : "Nothing marked as needed — you already had everything."}
            </p>
          ) : (
            needGroups.map((group) => (
              <div key={group.department}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.department}
                </div>
                <ul className="space-y-1 text-sm">
                  {group.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">
                        {item.qty !== null && (
                          <span className="tabular-nums">{String(Number(item.qty.toFixed(2)))} {item.unit} </span>
                        )}
                        {item.name}
                        {item.note && <span className="text-muted-foreground"> ({item.note})</span>}
                      </span>
                      {!locked && (
                        <>
                          <DepartmentSelect itemId={item.id} department={item.department} />
                          {item.manual && (
                            <form action={removeManualItem.bind(null, item.id)}>
                              <button
                                aria-label={`Remove ${item.name}`}
                                className="px-1 text-muted-foreground hover:text-destructive"
                              >
                                ×
                              </button>
                            </form>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
          {needItems.length > 0 && <CopyButton text={exportText} />}
        </CardContent>
      </Card>

      {/* Dates — the fix for a week you labelled wrong. A closed week hides it
          (legacy "done" rows); a lapsed week keeps it behind a disclosure,
          because wrong dates are exactly why a week lapses and it must stay
          fixable. */}
      {frozen !== "done" && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {frozen === "passed" ? "Wrong dates?" : "Week dates"}
            <InfoTip>
              Planned the right food but dated it wrong? Move the whole week here.
              {frozen === "passed"
                ? " A passed week keeps its own bank when it moves — re-dating fixes a mistake, it doesn't hand the week today's target."
                : " Changing the day count re-prorates the bank from your weekly target."}
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {frozen === "passed" && (
            <p className="mb-3 text-sm text-muted-foreground">
              This week has passed, so it&apos;s read-only — unless the dates were the
              mistake. Moving it back onto today&apos;s calendar makes it live again.
            </p>
          )}
          <form action={updateWeekDates} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="weekId" value={week.id} />
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Starts</div>
              <Input type="date" name="weekOf" defaultValue={weekOf} key={weekOf} />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Days</div>
              <select
                key={week.dayCount}
                name="dayCount"
                defaultValue={week.dayCount}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline">Save dates</Button>
          </form>
        </CardContent>
      </Card>
      )}

      {/* A week started by mistake shouldn't live forever — but only an empty
          one goes quietly (the action enforces the same rule). */}
      {!locked && emptyWeek && (
        <form action={deleteWeek.bind(null, week.id)}>
          <Button variant="ghost" size="sm" className="text-destructive">
            Delete this week
          </Button>
        </form>
      )}

      {/* Past weeks, collapsed: history is a drawer now, not a destination. */}
      {pastWeeks.length > 1 && (
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Past weeks
          </summary>
          <div className="mt-3 grid gap-2">
            {pastWeeks.map((past) => {
              const start = past.weekOf.toISOString().slice(0, 10);
              const end = weekEnd(start, past.dayCount);
              const logged = logDates.filter((e) => {
                const d = e.date.toISOString().slice(0, 10);
                return d >= start && d <= end;
              }).length;
              return (
                <Link
                  key={past.id}
                  href={`/weeks/${past.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/40"
                >
                  <span className="font-medium">{rangeLabel(start, past.dayCount)}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">
                    {past._count.recipes} recipe{past._count.recipes === 1 ? "" : "s"}
                    {logged > 0 && ` · ${logged} logged`}
                    <Badge variant="outline">{displayStatus(past, today)}</Badge>
                  </span>
                </Link>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function AddRecipeForm({ weekId, recipes, label }: {
  weekId: string;
  recipes: { id: string; name: string; kcalPerServing: number }[];
  label: string;
}) {
  if (recipes.length === 0) return null;
  return (
    <form action={async (fd: FormData) => {
      "use server";
      await addRecipeToWeek(weekId, String(fd.get("recipeId")));
    }} className="flex flex-wrap items-center gap-2">
      <select name="recipeId" className="h-9 min-w-48 rounded-md border bg-transparent px-2 text-sm">
        {recipes.map((r) => (
          <option key={r.id} value={r.id}>{r.name} ({r.kcalPerServing} kcal)</option>
        ))}
      </select>
      <Button type="submit" variant="outline" size="sm">{label}</Button>
    </form>
  );
}
