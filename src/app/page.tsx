// The public front door. Logged-out visitors get the landing page; anyone with
// a real session goes straight to the app. requireUser() is deliberately NOT
// used here — it redirects to /login when there's no session, which is the
// opposite of what a public page needs.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Landing } from "@/components/landing";

const DESCRIPTION =
  "A meal-prep planner and food diary built around a weekly calorie bank. " +
  "Plan the week, review the shopping list item by item, and track what you actually eat.";

export const metadata: Metadata = {
  title: "Prep Coach — plan the week, bank the calories, shop once",
  description: DESCRIPTION,
  openGraph: {
    title: "Prep Coach — plan the week, bank the calories, shop once",
    description: DESCRIPTION,
    siteName: "Prep Coach",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Prep Coach — plan the week, bank the calories, shop once",
    description: DESCRIPTION,
  },
};

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/week");
  return <Landing />;
}
