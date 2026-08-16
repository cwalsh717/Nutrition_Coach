// The week's lifecycle, made visible and pushable.
//
// Replaces the old status dropdown: the stepper says where the week is, and
// exactly one primary button says what finishing this stage means. Nothing
// advances behind your back.

import { Check } from "lucide-react";
import { advanceStage, revertStage } from "@/actions/weeks";
import { startShopping } from "@/actions/shopping";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { STAGES, stageIndex, type WeekStatus } from "@/lib/weeks";

export function WeekStepper({ status }: { status: WeekStatus }) {
  const current = stageIndex(status);
  return (
    <ol className="flex items-center gap-2">
      {STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={stage.status} className="flex flex-1 items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  active ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <span className={cn("h-px flex-1", done ? "bg-primary/60" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface ActionProps {
  weekId: string;
  status: WeekStatus;
  /** Why the week is read-only, if it is. A passed week gets a summary
   *  instead of CTAs — you can't shop for a week that already ended. */
  frozen?: "done" | "passed" | null;
  /** Planning can't finish with an empty week — nothing to shop for. */
  hasContents: boolean;
  needCount: number;
}

export function StageAction({ weekId, status, frozen, hasContents, needCount }: ActionProps) {
  const copy = {
    planning: {
      headline: "Done planning?",
      sub: hasContents
        ? "Locks in these meals and builds the shopping list from them."
        : "Add a recipe or a staple first — there's nothing to shop for yet.",
      cta: "Build the list & start shopping",
    },
    shopping: {
      headline: "Finished shopping?",
      sub:
        needCount > 0
          ? `Saves this ${needCount}-item list to the week for good and moves you to cooking.`
          : "Saves the list to the week for good and moves you to cooking.",
      cta: "Shopping done",
    },
    cooking: {
      headline: "Week finished?",
      sub: "Closes the week out. It stays readable in History with its plan and list.",
      cta: "Close out the week",
    },
    done: {
      headline: "This week is closed.",
      sub: "Its plan and list are frozen. Reopen it if you need to change something.",
      cta: "",
    },
  }[status];

  // Time closed this one. No stage to advance, nothing to revert to — offering
  // "Build the list & start shopping" for a week that already ended is the
  // ceremony this app stopped pretending to need.
  if (frozen === "passed") {
    return (
      <div className="rounded-xl border border-dashed bg-card/40 p-4">
        <div className="font-medium">This week has passed.</div>
        <div className="text-sm text-muted-foreground">
          Its plan and list are frozen in History
          {status !== "planning" && ` — it got as far as ${status}`}. If the dates
          were wrong, fix them below and the week comes back to life.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/60 p-4">
      <div className="min-w-48 flex-1">
        <div className="font-medium">{copy.headline}</div>
        <div className="text-sm text-muted-foreground">{copy.sub}</div>
      </div>

      <div className="flex items-center gap-2">
        {status === "planning" && (
          <form action={startShopping.bind(null, weekId)}>
            <Button disabled={!hasContents}>{copy.cta}</Button>
          </form>
        )}
        {(status === "shopping" || status === "cooking") && (
          <form action={advanceStage.bind(null, weekId)}>
            <Button>{copy.cta}</Button>
          </form>
        )}
        {status !== "planning" && (
          <form action={revertStage.bind(null, weekId)}>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              {status === "done" ? "Reopen" : "Back a step"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
