import "server-only";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { user as authUser } from "@/db/schema";

export type UserRole = "admin" | "manager" | "staff";

export interface UserRow {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
}

/**
 * List all accounts for the admin Users screen. Read-only, user
 * provisioning (invite / role change / deactivate) is a future DEC, see
 * PROGRESS.md Parking Lot. Ordered admins-first, then by name.
 */
export async function listUsersServer(): Promise<UserRow[]> {
  const rows = await db
    .select({
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      role: authUser.role,
      emailVerified: authUser.emailVerified,
      createdAt: authUser.createdAt,
    })
    .from(authUser)
    .orderBy(
      sql`case ${authUser.role} when 'admin' then 0 when 'manager' then 1 else 2 end`,
      asc(authUser.name),
    );

  return rows.map((r) => ({
    ...r,
    role: (r.role ?? "staff") as UserRole,
  }));
}
