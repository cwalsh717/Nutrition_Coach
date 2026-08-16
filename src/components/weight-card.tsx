"use client";

// The weigh-in card: one number, Save, and the recent readings underneath.
// Defaults to today; saving the same date again replaces that day's reading.

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { deleteWeight, saveWeight } from "@/actions/weight";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface WeightRow {
  id: string;
  date: string; // YYYY-MM-DD
  weightLb: number;
}

export function WeightCard({ entries, today }: { entries: WeightRow[]; today: string }) {
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(today);
  const [pending, startTransition] = useTransition();

  function submit() {
    const form = new FormData();
    form.set("date", date);
    form.set("weightLb", weight);
    startTransition(async () => {
      await saveWeight(form);
      setWeight("");
      toast.success("Weigh-in saved");
    });
  }

  // Newest first for the list; the chart elsewhere reads them oldest-first.
  const recent = [...entries].reverse().slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          inputMode="decimal"
          placeholder="lb"
          className="w-24"
        />
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          max={today}
          className="w-40"
        />
        <Button onClick={submit} disabled={pending || !weight.trim()}>
          Save
        </Button>
      </div>

      {recent.length > 0 && (
        <div className="grid gap-1">
          {recent.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{prettyDate(entry.date)}</span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{entry.weightLb} lb</span>
                <button
                  onClick={() => startTransition(() => deleteWeight(entry.id))}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete weigh-in from ${entry.date}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function prettyDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}
