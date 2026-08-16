import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true, // password hashing (scrypt) is built into better-auth
  },
  databaseHooks: {
    user: {
      create: {
        // Every new account gets an EMPTY profile row — no defaults, no
        // seeds. onboardedAt stays null, which routes them to /onboarding.
        after: async (user) => {
          await db.profile.create({ data: { userId: user.id } });
        },
      },
    },
  },
});
