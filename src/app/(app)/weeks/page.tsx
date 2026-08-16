import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { todayIso } from "@/lib/queries";
import { InfoTip } from "@/components/info-tip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { classify, rangeLabel, relativeLabel, weekEnd, type WeekStatus, displayStatus } from "@/lib/weeks";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WeeksPage() {
  const user = await requireUser();
  // Diary entries are the user's, so count them per week by date range rather
  // than through a relation the week no longer owns.
  const [weeks, log] = await Promise.all([
    db.week.findMany({
      where: { userId: user.id },
      orderBy: { weekOf: "desc" },
      include: {
        _count: { select: { recipes: true } },
        listItems: { where: { status: "need" }, select: { id: true } },
      },
    }),
    db.foodLogEntry.findMany({
      where: { userId: user.id },
      select: { date: true },
    }),
  ]);
  const loggedDates = log.map((e) => e.date.toISOString().slice(0, 10));

  const today = await todayIso();

  return (
    <div className="space-y-4">
      <h1 className="flex items-center gap-2 text-2xl">
        History
        <InfoTip>
          Every week you&apos;ve planned, newest first. Open one to see the meals it
          held and the shopping list you actually took to the store.
        </InfoTip>
      </h1>

      {weeks.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nothing yet. <Link href="/week/new" className="underline">Plan your first week</Link>.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {weeks.map((week) => {
            const weekOf = week.weekOf.toISOString().slice(0, 10);
            const when = classify(weekOf, week.dayCount, today);
            const status = week.status as WeekStatus;
            const end = weekEnd(weekOf, week.dayCount);
            const logged = loggedDates.filter((d) => d >= weekOf && d <= end).length;
            return (
              <Link key={week.id} href={`/weeks/${week.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{rangeLabel(weekOf, week.dayCount)}</span>
                        <span
                          className={cn(
                            "text-xs",
                            when === "current" ? "text-primary" : "text-muted-foreground",
                          )}
                        >
                          {relativeLabel(weekOf, week.dayCount, today)}
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm text-muted-foreground">
                        {week._count.recipes} recipe{week._count.recipes === 1 ? "" : "s"}
                        {week.listItems.length > 0 && ` · ${week.listItems.length} items bought`}
                        {logged > 0 && ` · ${logged} logged`}
                      </div>
                    </div>
                    <Badge variant={when === "past" ? "outline" : "default"}>
                      {displayStatus(week, today)}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <Button asChild variant="outline">
        <Link href="/week/new">+ Plan a new week</Link>
      </Button>
    </div>
  );
}
