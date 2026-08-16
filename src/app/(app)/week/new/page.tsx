import { requireUser } from "@/lib/session";
import { listWeeks, todayIso } from "@/lib/queries";
import { createWeek } from "@/actions/weeks";
import { InfoTip } from "@/components/info-tip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addDays, rangeLabel } from "@/lib/weeks";

export const dynamic = "force-dynamic";

export default async function NewWeekPage() {
  const user = await requireUser();
  const weeks = await listWeeks(user.id);
  const today = await todayIso();

  // Default to the next Sunday you don't already have a week for — meal prep is
  // planned ahead, so "next week" is the usual answer, not today.
  const daysUntilSunday = (7 - new Date(today + "T00:00:00Z").getUTCDay()) % 7 || 7;
  let suggested = addDays(today, daysUntilSunday);
  const taken = new Set(weeks.map((w) => w.weekOf));
  while (taken.has(suggested)) suggested = addDays(suggested, 7);

  return (
    <div className="mx-auto max-w-md space-y-4 pt-6">
      <h1 className="flex items-center gap-2 text-2xl">
        New week
        <InfoTip>
          Your profile targets are copied onto the week, so it keeps its numbers
          even if you change your profile later. A week covering fewer than 7
          days gets a proportionally smaller bank.
        </InfoTip>
      </h1>

      <Card>
        <CardContent className="pt-6">
          <form action={createWeek} className="flex flex-wrap items-end gap-2">
            <div className="min-w-36 flex-1">
              <div className="mb-1 text-xs text-muted-foreground">Starts</div>
              <Input type="date" name="weekOf" defaultValue={suggested} required />
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Days</div>
              <select
                name="dayCount"
                defaultValue={7}
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <Button type="submit">Start week</Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Suggested: {rangeLabel(suggested, 7)}
          </p>
        </CardContent>
      </Card>

      {weeks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          You already have {weeks.length} week{weeks.length === 1 ? "" : "s"}. Having
          several open is fine — plan next week while this one is still cooking.
        </p>
      )}
    </div>
  );
}
