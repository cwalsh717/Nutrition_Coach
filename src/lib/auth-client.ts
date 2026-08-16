import { createAuthClient } from "better-auth/react";

// Browser-side auth calls (signUp/signIn/signOut). Same-origin, so no baseURL.
export const authClient = createAuthClient();
