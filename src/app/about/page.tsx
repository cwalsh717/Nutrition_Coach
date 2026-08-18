// The permanent, linkable tutorial. Same content as the logged-out root, but
// reachable by anyone regardless of session — deep links and curious authed
// users both land here without a redirect either way.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Landing, landingMetadata } from "@/components/landing";

export const metadata: Metadata = landingMetadata;

export default async function AboutPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return <Landing hasSession={!!session} />;
}
