import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// One PrismaClient for the whole process. Next.js dev hot-reload re-imports
// modules constantly; without the globalThis stash we'd leak a connection
// pool per reload and exhaust Postgres.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function makeClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
