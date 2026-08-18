// The public front door. Logged-out visitors get the landing page; anyone with
// a real session goes straight to the app. requireUser() is deliberately NOT
// used here — it redirects to /login when there's no session, which is the
// opposite of what a public page needs.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Landing, landingMetadata } from "@/components/landing";

export const metadata: Metadata = landingMetadata;

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/week");
  return <Landing />;
}
