import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * The real security boundary. Every authed page and every server action calls
 * this first; the middleware cookie check is only a UX nicety. Never trust a
 * userId that came from the client.
 */
export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
}
