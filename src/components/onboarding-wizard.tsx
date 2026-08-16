"use client";

// Three steps: goal → vitals → weekly calorie bank.
// The bank number is SUGGESTED from the user's own vitals (Mifflin-St Jeor),
// shown on a slider they drag — nothing is saved until they hit Finish.

import { useMemo, useState, useTransition } from "react";
import { completeOnboarding } from "@/actions/profile";
import {
  bmr, suggestedProteinRange, suggestedWeeklyKcal,
  type Activity, type Goal, type Sex,
} from "@/lib/targets";
import { formulaMaintenance } from "@/lib/energy";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const GOALS: { value: Goal; title: string; blurb: string }[] = [
  { value: "lose", title: "Lose weight", blurb: "Bank fewer calories than you burn" },
  { value: "gain", title: "Gain weight", blurb: "Bank a surplus to build" },
  { value: "maintain", title: "Maintain", blurb: "Hold steady, eat deliberately" },
  { value: "eat_cleaner", title: "Just eat cleaner", blurb: "No calorie target — plan better weeks" },
];

const ACTIVITIES: { value: Activity; label: string }[] = [
  { value: "sedentary", label: "Sedentary (desk job, little exercise)" },
  { value: "light", label: "Light (1–3 workouts/week)" },
  { value: "moderate", label: "Moderate (3–5 workouts/week)" },
  { value: "very", label: "Very active (6–7 days/week)" },
  { value: "extra", label: "Extra active (physical job + training)" },
];

export function OnboardingWizard({ name }: { name: string }) {
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [age, setAge] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightExtraIn, setHeightExtraIn] = useState("");
  const [weightLb, setWeightLb] = useState("");
  const [goalWeightLb, setGoalWeightLb] = useState("");
  const [activity, setActivity] = useState<Activity>("light");
  const [bank, setBank] = useState<number | null>(null);
  const [wantsProtein, setWantsProtein] = useState(false);
  const [pending, startTransition] = useTransition();

  const heightIn = (Number(heightFt) || 0) * 12 + (Number(heightExtraIn) || 0);
  const vitalsComplete = sex && Number(age) > 0 && heightIn > 0 && Number(weightLb) > 0;

  const suggestion = useMemo(() => {
    if (!vitalsComplete || !goal || goal === "eat_cleaner") return null;
    return suggestedWeeklyKcal(
      { sex: sex as Sex, age: Number(age), heightIn, weightLb: Number(weightLb) },
      activity,
      goal,
    );
  }, [vitalsComplete, goal, sex, age, heightIn, weightLb, activity]);

  // Maintenance stated out loud, so the bank below reads as a deliberate
  // deficit (or surplus) off a named number — not math from nowhere.
  const maintenance = useMemo(() => {
    if (!vitalsComplete) return null;
    const vitals = { sex: sex as Sex, age: Number(age), heightIn, weightLb: Number(weightLb) };
    return { bmr: bmr(vitals), daily: formulaMaintenance(vitals, activity) };
  }, [vitalsComplete, sex, age, heightIn, weightLb, activity]);

  const protein = useMemo(() => {
    if (!Number(weightLb)) return null;
    return suggestedProteinRange(Number(weightLb), Number(goalWeightLb) || null);
  }, [weightLb, goalWeightLb]);

  const effectiveBank = bank ?? suggestion;

  function finish() {
    const form = new FormData();
    form.set("goalType", goal ?? "");
    form.set("sex", sex ?? "");
    form.set("age", age);
    form.set("heightIn", heightIn ? String(heightIn) : "");
    form.set("weightLb", weightLb);
    form.set("goalWeightLb", goalWeightLb);
    form.set("activityLevel", goal === "eat_cleaner" ? "" : activity);
    form.set("weeklyKcalBudget", goal !== "eat_cleaner" && effectiveBank ? String(effectiveBank) : "");
    form.set("proteinLowGDay", wantsProtein && protein ? String(protein.low) : "");
    form.set("proteinHighGDay", wantsProtein && protein ? String(protein.high) : "");
    form.set("aboutMe", "");
    startTransition(() => completeOnboarding(form));
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center p-4">
      <Card>
        <CardHeader>
          <p className="font-display text-base italic text-primary">Prep Coach</p>
          <CardTitle className="text-2xl">
            {step === 0 && `Hey ${name.split(" ")[0]} — what's the goal?`}
            {step === 1 && "The basics"}
            {step === 2 && "Your weekly calorie bank"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 && (
            <div className="grid gap-3">
              {GOALS.map((g) => (
                <button
                  key={g.value}
                  onClick={() => setGoal(g.value)}
                  className={cn(
                    "rounded-lg border p-4 text-left transition-colors",
                    goal === g.value ? "border-primary bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <div className="font-semibold">{g.title}</div>
                  <div className="text-sm text-muted-foreground">{g.blurb}</div>
                </button>
              ))}
              <Button className="mt-2" disabled={!goal} onClick={() => setStep(1)}>
                Next
              </Button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Sex (used only for the calorie math)</Label>
                <div className="flex gap-2">
                  {(["male", "female"] as const).map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant={sex === s ? "default" : "outline"}
                      onClick={() => setSex(s)}
                      className="flex-1 capitalize"
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <LabeledInput label="Age" value={age} onChange={setAge} suffix="yrs" />
                <div className="space-y-1.5">
                  <Label>Height</Label>
                  <div className="flex items-center gap-1">
                    <Input inputMode="numeric" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} className="w-14" />
                    <span className="text-sm text-muted-foreground">ft</span>
                    <Input inputMode="numeric" value={heightExtraIn} onChange={(e) => setHeightExtraIn(e.target.value)} className="w-14" />
                    <span className="text-sm text-muted-foreground">in</span>
                  </div>
                </div>
                <LabeledInput label="Weight" value={weightLb} onChange={setWeightLb} suffix="lb" />
                {goal !== "eat_cleaner" && goal !== "maintain" && (
                  <LabeledInput label="Goal weight (optional)" value={goalWeightLb} onChange={setGoalWeightLb} suffix="lb" />
                )}
              </div>
              {goal !== "eat_cleaner" && (
                <div className="space-y-1.5">
                  <Label>Activity level</Label>
                  <div className="grid gap-2">
                    {ACTIVITIES.map((a) => (
                      <button
                        key={a.value}
                        onClick={() => setActivity(a.value)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-left text-sm",
                          activity === a.value ? "border-primary bg-accent" : "hover:bg-accent/50",
                        )}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
                <Button className="flex-1" disabled={!vitalsComplete} onClick={() => setStep(2)}>
                  Next
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {goal === "eat_cleaner" || suggestion === null ? (
                <p className="text-sm text-muted-foreground">
                  No calorie target for this goal — you can always add one later in Profile.
                  You&apos;ll still plan weeks, build shopping lists, and track if you want to.
                </p>
              ) : (
                <>
                  {maintenance && (
                    <div className="rounded-lg border bg-card/60 p-3 text-sm">
                      You burn about{" "}
                      <strong className="text-primary">{maintenance.daily.toLocaleString()} kcal/day</strong>{" "}
                      — {maintenance.bmr.toLocaleString()} at rest plus daily movement.
                      That&apos;s your maintenance; the bank below sits{" "}
                      {goal === "lose" ? "under" : goal === "gain" ? "over" : "at"} it on purpose.
                    </div>
                  )}
                  <div className="text-center">
                    <div className="font-display text-5xl text-primary">
                      {(effectiveBank ?? 0).toLocaleString()}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">kcal per week (~{Math.round((effectiveBank ?? 0) / 7).toLocaleString()}/day)</div>
                  </div>
                  <Slider
                    value={[effectiveBank ?? suggestion]}
                    min={Math.max(7000, suggestion - 5000)}
                    max={suggestion + 5000}
                    step={100}
                    onValueChange={([v]) => setBank(v)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Suggested {suggestion.toLocaleString()} kcal from your numbers
                    (Mifflin-St Jeor, {goal === "lose" ? "−500" : goal === "gain" ? "+350" : "±0"} kcal/day for your goal).
                    Drag to whatever you'll actually stick to — it's your bank.
                  </p>
                </>
              )}

              {protein && goal !== "eat_cleaner" && (
                <button
                  onClick={() => setWantsProtein(!wantsProtein)}
                  className={cn(
                    "w-full rounded-lg border p-3 text-left text-sm",
                    wantsProtein ? "border-primary bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <span className="font-medium">
                    {wantsProtein ? "✓ " : ""}Also target protein: {protein.low}–{protein.high} g/day
                  </span>
                  <span className="block text-muted-foreground">
                    0.7–1 g per lb of {goalWeightLb ? "goal" : "body"} weight. Tap to toggle; editable later.
                  </span>
                </button>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button className="flex-1" onClick={finish} disabled={pending}>
                  {pending ? "Saving…" : "Finish setup"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{props.label}</Label>
      <div className="flex items-center gap-1.5">
        <Input inputMode="numeric" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
        {props.suffix && <span className="text-sm text-muted-foreground">{props.suffix}</span>}
      </div>
    </div>
  );
}
