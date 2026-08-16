import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Mounts all better-auth endpoints (signup, login, logout, session) under /api/auth/*.
export const { POST, GET } = toNextJsHandler(auth);
