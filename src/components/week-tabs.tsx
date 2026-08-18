// Weeks as tabs. Meal prep runs ahead of itself, so several weeks can be open
// at once: this week being eaten, next week being planned.

import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { classify, rangeLabel, relativeLabel, type WeekLike } from "@/lib/weeks";

interface Props {
  weeks: WeekLike[];
  selectedId: string | null;
  today: string;
  /** "/week" or "/week/chat" — tabs keep you on the same page. */
  basePath: string;
}

export function WeekTabs({ weeks, selectedId, today, basePath }: Props) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {weeks.map((week) => {
        const when = classify(week.weekOf, week.dayCount, today);
        const selected = week.id === selectedId;
        return (
          <Link
            key={week.id}
            href={`${basePath}?w=${week.id}`}
            className={cn(
              "shrink-0 rounded-lg border px-3 py-2 text-left transition-colors",
              selected ? "border-primary bg-accent" : "hover:bg-accent/50",
            )}
          >
            <div
              className={cn(
                "text-[10px] uppercase tracking-[0.12em]",
                when === "current" ? "text-primary" : "text-muted-foreground",
              )}
            >
              {relativeLabel(week.weekOf, week.dayCount, today)}
            </div>
            <div className={cn("text-sm", selected ? "font-semibold" : "text-muted-foreground")}>
              {rangeLabel(week.weekOf, week.dayCount)}
            </div>
          </Link>
        );
      })}

      <Link
        href="/week/new"
        className="flex shrink-0 items-center gap-1 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-accent/50"
      >
        <Plus className="size-4" />
        New week
      </Link>
    </div>
  );
}
