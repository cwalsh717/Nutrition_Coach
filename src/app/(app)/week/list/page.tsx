import Link from "next/link";
import { requireUser } from "@/lib/session";
import { computeWeekTotals, listWeeks, resolveWeek, todayIso } from "@/lib/queries";
import { asPlainText, groupByDepartment } from "@/lib/shopping";
import { buildShoppingList } from "@/actions/shopping";
import { BankMeter } from "@/components/bank-meter";
import { CopyButton } from "@/components/copy-button";
import { InfoTip } from "@/components/info-tip";
import { ListReview, type ReviewItem } from "@/components/list-review";
import { WeekTabs } from "@/components/week-tabs";
import { StageAction } from "@/components/week-stage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { isListLocked, rangeLabel, type WeekStatus } from "@/lib/weeks";

export const dynamic = "force-dynamic";

export default async function ListPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const user = await requireUser();
  const { w } = await searchParams;
  const [week, weeks] = await Promise.all([resolveWeek(user.id, w), listWeeks(user.id)]);

  if (!week) {
    return (
      <p className="pt-10 text-center text-muted-foreground">
        No weeks yet — <Link href="/week/new" className="underline">start one</Link>.
      </p>
    );
  }

  const today = await todayIso();
  const weekOf = week.weekOf.toISOString().slice(0, 10);
  const status = week.status as WeekStatus;
  const locked = isListLocked(status);
  const totals = computeWeekTotals(week);

  const items: ReviewItem[] = week.listItems.map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.qty,
    unit: item.unit,
    department: item.department,
    sources: item.sources,
    likelyHave: item.likelyHave,
    status: item.status,
  }));

  const needItems = items.filter((i) => i.status === "need");
  const needGroups = groupByDepartment(needItems);
  const exportText = asPlainText(needGroups, totals.totalKcal);

  return (
    <div className="space-y-6">
      <WeekTabs weeks={weeks} selectedId={week.id} today={today} basePath="/week/list" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl">Shopping list</h1>
          <span className="text-sm text-muted-foreground">
            {rangeLabel(weekOf, week.dayCount)}
          </span>
          {locked && <Badge variant="outline">saved · {status}</Badge>}
        </div>

        {!locked && items.length > 0 && (
          <div className="flex items-center gap-2">
            <form action={buildShoppingList.bind(null, week.id)}>
              <Button variant="outline">Rebuild list</Button>
            </form>
            <InfoTip>
              Re-assembles the list from this week&apos;s recipes and staples, which
              resets every Have/Need answer you&apos;ve given.
            </InfoTip>
          </div>
        )}
      </div>

      {status === "planning" ? (
        <>
          <BankMeter
            totalKcal={totals.totalKcal}
            recipeKcal={totals.recipeKcal}
            stapleKcal={totals.stapleKcal}
            budgetKcal={week.budgetKcal}
            dayCount={week.dayCount}
          />
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              {week.recipes.length === 0 && week.staples.length === 0 ? (
                <>This week is empty — add meals on the{" "}
                  <Link href={`/week?w=${week.id}`} className="underline">Week page</Link> first.</>
              ) : (
                <>The list gets built when you finish planning. Head back to the{" "}
                  <Link href={`/week?w=${week.id}`} className="underline">Week page</Link>{" "}
                  and hit <strong className="text-foreground">Build the list &amp; start shopping</strong>.</>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {!locked && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Need it, or have it?
                  <InfoTip>
                    Likely buys are on top; things you probably keep around (salt, oil,
                    spices) wait at the bottom. Nothing is removed for you — you make
                    every call.
                  </InfoTip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ListReview weekId={week.id} items={items} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {locked ? "The list you shopped" : `The list (${needItems.length} items)`}
                <InfoTip>
                  Grouped in the order you walk the store — produce first, frozen
                  near the end. The copy button formats it for a ShopRite pickup order.
                </InfoTip>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                {needItems.length} item{needItems.length === 1 ? "" : "s"} · estimated week total{" "}
                <strong className="text-primary">{totals.totalKcal.toLocaleString()} kcal</strong>
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {needItems.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Nothing marked as needed — you already had everything.
                </p>
              ) : (
                needGroups.map((group) => (
                  <div key={group.department}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.department}
                    </div>
                    <ul className="space-y-0.5 text-sm">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          {item.qty !== null && (
                            <span className="tabular-nums">{String(Number(item.qty.toFixed(2)))} {item.unit} </span>
                          )}
                          {item.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
              {needItems.length > 0 && <CopyButton text={exportText} />}
            </CardContent>
          </Card>

          {!locked && (
            <StageAction
              weekId={week.id}
              status={status}
              hasContents
              needCount={needItems.length}
            />
          )}
        </>
      )}
    </div>
  );
}
