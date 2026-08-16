"use client";

// Food diary: quick entries per day, with an optional "Ask advisor" that gets
// a Claude estimate and PREFILLS the numbers — the user always hits Add.

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addEntry, deleteEntry } from "@/actions/diary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Sparkles, Trash2 } from "lucide-react";

export interface DiaryEntry {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  kcal: number;
  proteinG: number | null;
  source: "manual" | "advisor";
}

/** A saved Staple or Quick Eat, ready to log in one tap. */
export interface SavedFood {
  id: string;
  name: string;
  kind: "grocery" | "quick_eat";
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingNote: string;
}

interface Props {
  days: string[]; // the seven dates of the calendar week being viewed
  today: string;
  focusDate: string;
  entries: DiaryEntry[];
  budgetKcal: number | null;
  proteinLowGDay: number | null;
  savedFoods: SavedFood[];
  /** Whether a plan covers these days — changes what the bank label means. */
  hasPlan: boolean;
}

export function Diary({
  days, today, focusDate, entries, budgetKcal, proteinLowGDay, savedFoods, hasPlan,
}: Props) {
  const initialDay = days.includes(today) ? today : focusDate;
  const [day, setDay] = useState(initialDay);
  const [description, setDescription] = useState("");
  const [kcal, setKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [advisorNote, setAdvisorNote] = useState("");
  const [fromAdvisor, setFromAdvisor] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [pending, startTransition] = useTransition();

  const dayEntries = entries.filter((e) => e.date === day);
  const dayKcal = dayEntries.reduce((sum, e) => sum + e.kcal, 0);
  // What one day of the bank is worth. Days can vary — the week is the real
  // judge — but this is the pace line.
  const dayGoal = budgetKcal === null ? null : Math.round(budgetKcal / 7);
  const dayProtein = dayEntries.reduce((sum, e) => sum + (e.proteinG ?? 0), 0);
  const weekKcal = entries.reduce((sum, e) => sum + e.kcal, 0);
  const isThisWeek = days.includes(today);
  const daysLeft = days.filter((d) => d >= today).length;

  async function askAdvisor() {
    if (!description.trim()) return;
    setEstimating(true);
    setAdvisorNote("");
    try {
      const res = await fetch("/api/estimate-food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Estimate failed.");
      } else {
        setKcal(String(data.kcal));
        setProteinG(String(data.protein_g));
        setAdvisorNote(data.note || "Estimate filled in — adjust if it looks off.");
        setFromAdvisor(true);
      }
    } catch {
      toast.error("Couldn't reach the advisor — enter the numbers manually.");
    } finally {
      setEstimating(false);
    }
  }

  /** One tap from the saved-foods row. Items without calories prefill the form
   *  instead of logging, since there'd be nothing to count. */
  function logSaved(food: SavedFood) {
    const label = food.servingNote ? `${food.name} (${food.servingNote})` : food.name;
    if (food.kcal === null) {
      setDescription(label);
      setFromAdvisor(false);
      toast.info(`${food.name} has no calories saved — add them here or on the Foods page.`);
      return;
    }
    const form = new FormData();
    form.set("date", day);
    form.set("description", label);
    form.set("kcal", String(food.kcal));
    if (food.proteinG !== null) form.set("proteinG", String(food.proteinG));
    if (food.carbsG !== null) form.set("carbsG", String(food.carbsG));
    if (food.fatG !== null) form.set("fatG", String(food.fatG));
    form.set("source", "manual");
    startTransition(async () => {
      await addEntry(form);
      toast.success(`Logged ${food.name}`);
    });
  }

  function submit() {
    const form = new FormData();
    form.set("date", day);
    form.set("description", description);
    form.set("kcal", kcal);
    form.set("proteinG", proteinG);
    form.set("source", fromAdvisor ? "advisor" : "manual");
    startTransition(async () => {
      await addEntry(form);
      setDescription("");
      setKcal("");
      setProteinG("");
      setAdvisorNote("");
      setFromAdvisor(false);
    });
  }

  return (
    <div className="space-y-4">
      {/* Header math — only judgments the user opted into */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label={`${labelFor(day, today)} so far`}
          value={`${dayKcal.toLocaleString()} kcal`}
          sub={
            dayGoal === null
              ? undefined
              : dayKcal <= dayGoal
                ? `${(dayGoal - dayKcal).toLocaleString()} of ${dayGoal.toLocaleString()} remaining`
                : `${(dayKcal - dayGoal).toLocaleString()} over today's ${dayGoal.toLocaleString()}`
          }
          warn={dayGoal !== null && dayKcal > dayGoal}
        />
        {budgetKcal !== null ? (
          <Stat
            label={isThisWeek ? `Bank (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)` : "Bank that week"}
            value={`${(budgetKcal - weekKcal).toLocaleString()} left`}
            sub={`${weekKcal.toLocaleString()} of ${budgetKcal.toLocaleString()}${hasPlan ? "" : " (profile target)"}`}
            warn={budgetKcal - weekKcal < 0}
          />
        ) : (
          <Stat label="Week so far" value={`${weekKcal.toLocaleString()} kcal`} />
        )}
        {proteinLowGDay !== null && (
          <Stat
            label={`Protein ${labelFor(day, today).toLowerCase()}`}
            value={`${dayProtein} / ${proteinLowGDay} g`}
            warn={false}
          />
        )}
      </div>

      {/* Week navigation + day tabs. Plain calendar weeks, so this works on any
          date whether or not a plan exists. */}
      <div className="flex items-center gap-2">
        <Link
          href={`/track?d=${shiftWeek(days[0], -7)}`}
          aria-label="Previous week"
          className="rounded-md border p-2 text-muted-foreground hover:bg-accent"
        >
          <ChevronLeft className="size-4" />
        </Link>

        <div className="flex flex-1 gap-1 overflow-x-auto">
          {days.map((d) => (
            <button
              key={d}
              onClick={() => setDay(d)}
              className={cn(
                "flex-1 shrink-0 rounded-md border px-2 py-1.5 text-sm",
                d === day ? "border-primary bg-accent font-semibold" : "text-muted-foreground hover:bg-accent/50",
                d === today && "underline underline-offset-4",
              )}
            >
              {shortDay(d)}
            </button>
          ))}
        </div>

        <Link
          href={`/track?d=${shiftWeek(days[0], 7)}`}
          aria-label="Next week"
          className="rounded-md border p-2 text-muted-foreground hover:bg-accent"
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {!isThisWeek && (
        <p className="text-xs text-muted-foreground">
          Viewing another week.{" "}
          <Link href="/track" className="underline">Jump back to today</Link>.
        </p>
      )}

      {/* Saved foods — one tap to log something you eat all the time */}
      {savedFoods.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Tap to log
          </div>
          <div className="flex flex-wrap gap-1.5">
            {savedFoods.map((food) => (
              <button
                key={food.id}
                type="button"
                onClick={() => logSaved(food)}
                disabled={pending}
                className="rounded-full border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
              >
                {food.name}
                {food.kcal !== null && (
                  <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                    {food.kcal}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick add */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          <Input
            value={description}
            onChange={(e) => { setDescription(e.target.value); setFromAdvisor(false); }}
            placeholder="What did you eat? e.g. PB&J on wheat and a glass of milk"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              inputMode="numeric"
              placeholder="kcal"
              className="w-24"
            />
            <Input
              value={proteinG}
              onChange={(e) => setProteinG(e.target.value)}
              inputMode="numeric"
              placeholder="protein g (opt.)"
              className="w-36"
            />
            <Button
              type="button"
              variant="outline"
              onClick={askAdvisor}
              disabled={estimating || !description.trim()}
            >
              <Sparkles className="mr-1 size-4" />
              {estimating ? "Estimating…" : "Ask advisor"}
            </Button>
            <Button onClick={submit} disabled={pending || !description.trim() || !kcal.trim()}>
              Add
            </Button>
          </div>
          {advisorNote && <p className="text-xs text-muted-foreground">{advisorNote}</p>}
        </CardContent>
      </Card>

      {/* Entries for the day */}
      <div className="grid gap-1.5">
        {dayEntries.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing logged for {labelFor(day, today).toLowerCase()}.
          </p>
        )}
        {dayEntries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{entry.description}</div>
              <div className="text-xs text-muted-foreground">
                {entry.kcal} kcal
                {entry.proteinG !== null && ` · ${entry.proteinG} g protein`}
                {entry.source === "advisor" && (
                  <Badge variant="secondary" className="ml-2 text-[10px]">advisor estimate</Badge>
                )}
              </div>
            </div>
            <button
              onClick={() => startTransition(() => deleteEntry(entry.id))}
              className="p-1.5 text-muted-foreground hover:text-destructive"
              aria-label="Delete entry"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-xl border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={cn("font-display text-2xl", warn ? "text-destructive" : "text-primary")}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Move a date by whole days, staying in UTC so no timezone drift. */
function shiftWeek(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function labelFor(day: string, today: string): string {
  return day === today ? "Today" : shortDay(day);
}

function shortDay(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric", timeZone: "UTC" });
}
