import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  buildCookbookSection, buildProgressSection, buildWeekStateSection,
  getFoodLogForWeek, resolveWeek,
} from "@/lib/queries";
import { buildProfileSection, coachReply } from "@/lib/claude/coach";
import { friendlyClaudeError } from "@/lib/claude/client";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const userId = session.user.id;

  const { message, weekId } = (await request.json()) as { message?: string; weekId?: string };
  if (!message?.trim()) return NextResponse.json({ error: "Empty message." }, { status: 400 });

  const week = await resolveWeek(userId, weekId);
  if (!week) return NextResponse.json({ error: "Start a week first." }, { status: 400 });

  // Persist the user turn immediately — it survives even if Claude errors.
  await db.chatMessage.create({
    data: { weekId: week.id, role: "user", content: message.trim() },
  });

  const [profile, cookbook, diary, progress] = await Promise.all([
    db.profile.findUnique({ where: { userId } }),
    buildCookbookSection(userId),
    getFoodLogForWeek(userId, week.weekOf, week.dayCount),
    buildProgressSection(userId),
  ]);
  const history = await db.chatMessage.findMany({
    where: { weekId: week.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  try {
    const reply = await coachReply(
      buildProfileSection(profile ?? { goalType: null, sex: null, age: null, heightIn: null, weightLb: null, goalWeightLb: null, weeklyKcalBudget: null, proteinLowGDay: null, proteinHighGDay: null, aboutMe: "" }),
      buildWeekStateSection(week, diary) + "\n\n" + progress + "\n\n" + cookbook,
      history
        .reverse()
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    );
    const saved = await db.chatMessage.create({
      data: { weekId: week.id, role: "assistant", content: reply },
    });
    return NextResponse.json({ reply, id: saved.id });
  } catch (error) {
    // Don't persist a broken assistant turn; the user's message stays.
    return NextResponse.json({ error: friendlyClaudeError(error) }, { status: 502 });
  }
}
