import { IngestFlow } from "@/components/ingest-flow";
import { requireUser } from "@/lib/session";
import { resolveWeek, todayIso } from "@/lib/queries";
import { isWeekEditable, rangeLabel } from "@/lib/weeks";

export const dynamic = "force-dynamic";

export default async function IngestPage() {
  const user = await requireUser();
  // The "also add to <week>" target is resolved HERE and named in the UI —
  // never a mystery week decided at save time. No editable week, no checkbox.
  const [week, today] = await Promise.all([resolveWeek(user.id), todayIso()]);
  const targetWeek =
    week && isWeekEditable(week, today)
      ? {
          id: week.id,
          label: rangeLabel(week.weekOf.toISOString().slice(0, 10), week.dayCount),
        }
      : null;
  return <IngestFlow targetWeek={targetWeek} />;
}
