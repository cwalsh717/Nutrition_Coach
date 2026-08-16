import "server-only";
import { anthropic, firstText, MODEL } from "./client";

// The coach persona carries ZERO baked-in facts about any person. Everything
// personal comes from the user's own profile row; everything situational
// comes from live week state assembled by the caller.
const PERSONA = `You are a personal nutrition coach inside a meal-prep planning app.

Your job: review the user's week plan, sanity-check their shopping list, flag gaps
against THEIR OWN targets (never targets you invent), suggest which of THEIR recipes
or staples could fill a gap, and answer nutrition questions factually.

Tone: direct, numbers-first, no lectures, no moralizing about food choices.

You are read-only: you cannot change the plan or any data. When you recommend a
change, tell the user exactly where to do it in the app (Week page, Shopping page,
Cook Book, Track page, Profile).

Formatting: light markdown only — short paragraphs, "-" lists, **bold** for key
numbers. No headers, no tables.`;

export interface CoachProfileFields {
  goalType: string | null;
  sex: string | null;
  age: number | null;
  heightIn: number | null;
  weightLb: number | null;
  goalWeightLb: number | null;
  weeklyKcalBudget: number | null;
  proteinLowGDay: number | null;
  proteinHighGDay: number | null;
  aboutMe: string;
}

export function buildProfileSection(profile: CoachProfileFields): string {
  const lines: string[] = [];
  if (profile.goalType) lines.push(`Goal: ${profile.goalType.replace("_", " ")}`);
  if (profile.sex) lines.push(`Sex: ${profile.sex}`);
  if (profile.age) lines.push(`Age: ${profile.age}`);
  if (profile.heightIn) lines.push(`Height: ${Math.floor(profile.heightIn / 12)}'${profile.heightIn % 12}"`);
  if (profile.weightLb) lines.push(`Weight: ${profile.weightLb} lb`);
  if (profile.goalWeightLb) lines.push(`Goal weight: ${profile.goalWeightLb} lb`);
  if (profile.weeklyKcalBudget) {
    lines.push(`Weekly calorie bank: ${profile.weeklyKcalBudget.toLocaleString()} kcal (their chosen number)`);
  }
  if (profile.proteinLowGDay) {
    const high = profile.proteinHighGDay ? `-${profile.proteinHighGDay}` : "";
    lines.push(`Protein target: ${profile.proteinLowGDay}${high} g/day`);
  }
  if (profile.aboutMe.trim()) {
    lines.push("", "In the user's own words:", profile.aboutMe.trim());
  }
  if (lines.length === 0) {
    return "The user has not filled in their profile. Be a helpful general nutrition coach; do not invent stats, goals, or targets for them.";
  }
  return lines.join("\n");
}

export async function coachReply(
  profileSection: string,
  weekStateSection: string,
  history: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const system = `${PERSONA}\n\n# The user (from their profile — their words, their numbers)\n${profileSection}\n\n# Current week state\n${weekStateSection}`;
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: history,
  });
  return firstText(response.content);
}
