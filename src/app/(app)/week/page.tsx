import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { computeWeekTotals, listWeeks, resolveWeek, todayIso } from "@/lib/queries";
import {
  addRecipeToWeek, addStapleToWeek, removeRecipeFromWeek, removeWeekStaple,
  updatePortions, updateWeekDates, updateWeekStapleQty,
} from "@/actions/weeks";
import { BankMeter } from "@/components/bank-meter";
import { InfoTip } from "@/components/info-tip";
import { WeekTabs } from "@/components/week-tabs";
import { StageAction, WeekStepper } from "@/components/week-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rangeLabel, relativeLabel, type WeekStatus } from "@/lib/weeks";

export const dynamic = "force-dynamic";

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const user = await requireUser();
  const { w } = await searchParams;
  const [week, weeks] = await Promise.all([
    resolveWeek(user.id, w),
    listWeeks(user.id),
  ]);

  // No weeks at all — send them straight to the one thing they can do.
  if (!week) redirect("/week/new");

  const today = await todayIso();
  const weekOf = week.weekOf.toISOString().slice(0, 10);
  const status = week.status as WeekStatus;
  const totals = computeWeekTotals(week);
  const needCount = week.listItems.filter((i) => i.status === "need").length;

  // "Not retired" has to be spelled out: `NOT { keeper: false }` silently drops
  // unrated recipes, because SQL's NOT(NULL = false) is UNKNOWN, not true.
  const notRetired = [{ keeper: null }, { keeper: true }];

  const [mains, fillers, allStaples] = await Promise.all([
    db.recipe.findMany({
      where: { userId: user.id, slot: "main", OR: notRetired },
      orderBy: { name: "asc" },
    }),
    db.recipe.findMany({
      where: { userId: user.id, slot: { not: "main" }, OR: notRetired },
      orderBy: { name: "asc" },
    }),
    // Only groceries can be planned into a week — quick eats are log-only.
    db.staple.findMany({
      where: { userId: user.id, kind: "grocery" },
      orderBy: { name: "asc" },
    }),
  ]);

  const locked = status === "done";

  return (
    <div className="space-y-6">
      <WeekTabs weeks={weeks} selectedId={week.id} today={today} basePath="/week" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl">{rangeLabel(weekOf, week.dayCount)}</h1>
        <span className="text-sm text-muted-foreground">
          {relativeLabel(weekOf, week.dayCount, today)}
          {week.dayCount < 7 && ` · ${week.dayCount}-day week`}
        </span>
      </div>

      <WeekStepper status={status} />

      <StageAction
        weekId={week.id}
        status={status}
        hasContents={week.recipes.length > 0 || week.staples.length > 0}
        needCount={needCount}
      />

      <BankMeter
        totalKcal={totals.totalKcal}
        recipeKcal={totals.recipeKcal}
        stapleKcal={totals.stapleKcal}
        budgetKcal={week.budgetKcal}
        dayCount={week.dayCount}
      />

      {week.proteinLowGDay !== null ? (
        <p className="text-sm">
          Protein: <strong>{totals.totalProtein} g</strong> planned (~{totals.proteinPerDay} g/day)
          vs your {week.proteinLowGDay}
          {week.proteinHighGDay ? `–${week.proteinHighGDay}` : ""} g/day target —{" "}
          {totals.proteinGapPerDay! > 0 ? (
            <span className="font-semibold text-destructive">{totals.proteinGapPerDay} g/day short</span>
          ) : (
            <span className="font-semibold text-primary">on target</span>
          )}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Protein planned: {totals.totalProtein} g (~{totals.proteinPerDay} g/day). No target set.
        </p>
      )}

      {/* Recipes */}
      <Card>
        <CardHeader><CardTitle>Recipes this week</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {week.recipes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              None yet — pick mains below or <Link href="/ingest" className="underline">ingest a new one</Link>.
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
        </CardContent>
      </Card>

      {/* Staples */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Staples this week
            <InfoTip>
              Picked from your staples library. They land on the shopping list, and
              any with calories count toward the bank.
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {week.staples.length === 0 && (
            <p className="text-sm text-muted-foreground">None picked for this week yet.</p>
          )}
          {week.staples.map((ws) => (
            <div key={ws.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <div className="min-w-40 flex-1">
                <div className="font-medium">{ws.name}</div>
                <div className="text-sm text-muted-foreground">
                  {ws.kcal !== null ? `${ws.kcal} kcal${ws.proteinG ? ` · ${ws.proteinG} g protein` : ""} each` : "no calorie data"}
                </div>
              </div>
              {!locked ? (
                <>
                  <form action={async (fd: FormData) => {
                    "use server";
                    await updateWeekStapleQty(ws.id, Number(fd.get("qty")));
                  }} className="flex items-center gap-1.5">
                    <Input name="qty" inputMode="numeric" defaultValue={ws.qty} className="w-16" />
                    <span className="text-sm text-muted-foreground">/week</span>
                    <Button type="submit" variant="outline" size="sm">Update</Button>
                  </form>
                  <form action={removeWeekStaple.bind(null, ws.id)}>
                    <Button variant="ghost" size="sm" className="text-destructive">Remove</Button>
                  </form>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">×{ws.qty}</span>
              )}
            </div>
          ))}

          {!locked && (allStaples.length > 0 ? (
            <form action={async (fd: FormData) => {
              "use server";
              await addStapleToWeek(week.id, String(fd.get("stapleId")));
            }} className="flex flex-wrap items-center gap-2 pt-1">
              <select name="stapleId" className="h-9 min-w-48 rounded-md border bg-transparent px-2 text-sm">
                {allStaples.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.kcal !== null ? ` (${s.kcal} kcal)` : ""}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline" size="sm">Add to week</Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Your staples library is empty — <Link href="/staples" className="underline">build it</Link>.
            </p>
          ))}
        </CardContent>
      </Card>

      {/* Dates — the fix for a week you labelled wrong */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Week dates
            <InfoTip>
              Planned the right food but dated it wrong? Move the whole week here.
              Changing the day count re-prorates the bank from your weekly target.
            </InfoTip>
          </CardTitle>
        </CardHeader>
        <CardContent>
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
