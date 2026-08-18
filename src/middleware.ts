import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * UX-only gate: bounce obviously-logged-out visitors to /login without a
 * server render. This checks that a session cookie EXISTS, not that it's
 * valid — the authoritative check is requireUser() inside every page and
 * server action. Deleting this file would not create a security hole;
 * deleting requireUser() calls would.
 */
export function middleware(request: NextRequest) {
  // The landing page and the tutorial are the things a logged-out visitor is
  // meant to see, and each decides for itself whether a session changes
  // anything — never bounce either one to /login.
  if (request.nextUrl.pathname === "/" || request.nextUrl.pathname === "/about") {
    return NextResponse.next();
  }

  const cookie = getSessionCookie(request);
  if (!cookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except auth pages, auth API, and static assets.
  matcher: [
    "/((?!login|signup|about|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
