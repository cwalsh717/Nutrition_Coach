import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { estimateFood } from "@/lib/claude/estimate-food";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });

  const { description } = (await request.json()) as { description?: string };
  if (!description?.trim()) {
    return NextResponse.json({ error: "Describe what you ate first." }, { status: 400 });
  }

  const result = await estimateFood(description.trim());
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json(result.estimate);
}
