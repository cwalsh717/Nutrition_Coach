// Admin tool: set a user's password directly in the database.
// For the day someone is locked out and the email reset flow can't help
// (or doesn't exist yet). Uses better-auth's own hashPassword, so the stored
// hash is exactly what a fresh signup would have written.
//
// Usage (run from the repo root; password is typed by the operator, never
// stored anywhere but the hash):
//   RESET_EMAIL='who@example.com' NEW_PASSWORD='their new password' \
//     npx tsx scripts/reset-password.mts
//
// Targets the DATABASE_URL from .env by default. To run against another
// database (e.g. production over a TCP proxy), override it:
//   TARGET_DATABASE_URL='postgresql://...' RESET_EMAIL=... NEW_PASSWORD=... \
//     npx tsx scripts/reset-password.mts

import "dotenv/config";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.env.RESET_EMAIL;
const newPassword = process.env.NEW_PASSWORD;
const url = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!email || !newPassword || !url) {
  console.error("Need RESET_EMAIL, NEW_PASSWORD, and a database URL. See header comment.");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error("Password must be at least 8 characters (matches the signup rule).");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const user = await db.user.findFirst({ where: { email } });
if (!user) {
  console.error(`No user with email ${email} in the target database.`);
  process.exit(1);
}

const account = await db.account.findFirst({
  where: { userId: user.id, providerId: "credential" },
});
if (!account) {
  console.error(`${email} exists but has no password account (credential provider).`);
  process.exit(1);
}

await db.account.update({
  where: { id: account.id },
  data: { password: await hashPassword(newPassword) },
});

// Old sessions may belong to whoever knew the old password — end them.
const { count } = await db.session.deleteMany({ where: { userId: user.id } });

console.log(`Password updated for ${email}. ${count} old session(s) signed out.`);
await db.$disconnect();
