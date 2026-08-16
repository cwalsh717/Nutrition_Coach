"use client";

// The interactive Need/Have review. Items arrive pre-sorted likely-need-first;
// the "you probably have these" section is a label, never a decision — every
// item waits for the user's tap. Optimistic local state keeps taps instant.

import { useOptimistic, useTransition } from "react";
import { markRemaining, setItemStatus } from "@/actions/shopping";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ReviewItem {
  id: string;
  name: string;
  qty: number | null;
  unit: string;
  department: string;
  sources: string[];
  likelyHave: boolean;
  status: "unreviewed" | "have" | "need";
}

export function ListReview({ weekId, items }: { weekId: string; items: ReviewItem[] }) {
  const [optimistic, apply] = useOptimistic(
    items,
    (state, update: { id: string; status: "have" | "need" }) =>
      state.map((item) => (item.id === update.id ? { ...item, status: update.status } : item)),
  );
  const [, startTransition] = useTransition();

  function toggle(id: string, status: "have" | "need") {
    startTransition(async () => {
      apply({ id, status });
      await setItemStatus(id, status);
    });
  }

  const unreviewed = optimistic.filter((i) => i.status === "unreviewed").length;
  const likelyNeed = optimistic.filter((i) => !i.likelyHave);
  const likelyHave = optimistic.filter((i) => i.likelyHave);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {unreviewed === 0
            ? "All items reviewed."
            : `${unreviewed} of ${optimistic.length} still unreviewed.`}
        </p>
        {unreviewed > 0 && (
          <form action={markRemaining.bind(null, weekId, "need")}>
            <Button variant="outline" size="sm">Mark remaining as Need</Button>
          </form>
        )}
      </div>

      <ItemRows items={likelyNeed} onToggle={toggle} />

      {likelyHave.length > 0 && (
        <>
          <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            You probably have these — confirm each one
          </div>
          <ItemRows items={likelyHave} onToggle={toggle} />
        </>
      )}
    </div>
  );
}

function ItemRows({ items, onToggle }: {
  items: ReviewItem[];
  onToggle: (id: string, status: "have" | "need") => void;
}) {
  return (
    <div className="grid gap-1.5">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-2",
            item.status === "have" && "opacity-50",
          )}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">
              {item.qty !== null && <span className="tabular-nums">{formatQty(item.qty)} {item.unit} </span>}
              {item.name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {item.department} · {item.sources.join(", ")}
            </div>
          </div>
          <div className="flex gap-1">
            <ToggleButton
              active={item.status === "have"}
              label="Have"
              onClick={() => onToggle(item.id, "have")}
            />
            <ToggleButton
              active={item.status === "need"}
              label="Need"
              primary
              onClick={() => onToggle(item.id, "need")}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function ToggleButton({ active, label, primary, onClick }: {
  active: boolean; label: string; primary?: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "min-w-16 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
        active && primary && "border-primary bg-primary text-primary-foreground",
        active && !primary && "border-foreground/40 bg-muted",
        !active && "text-muted-foreground hover:bg-accent",
      )}
    >
      {label}
    </button>
  );
}

function formatQty(qty: number): string {
  return String(Number(qty.toFixed(2)));
}
