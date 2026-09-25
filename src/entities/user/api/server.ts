import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { companyMembers, user as authUser } from "@/db/schema";

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
 * List the accounts of the acting company for the admin Users screen.
 * Read-only, user provisioning (invite / role change / deactivate) is a future
 * DEC, see PROGRESS.md Parking Lot. Ordered admins-first, then by name.
 *
 * WHY THIS ONE JOINS INSTEAD OF FILTERING A COLUMN. `user` is Better Auth's
 * table and deliberately carries no `company_id` (src/db/schema/companies.ts);
 * the edge from a person to a company is `company_members`. An INNER join to
 * it is therefore the company predicate for this surface, and it is an inner
 * join on purpose: an account that belongs to no company is not a row of this
 * roster, and showing it would put an outsider on the screen that decides who
 * has access.
 *
 * WHY THIS SURFACE COUNTS AS A DOMAIN READ AT ALL. The FR-29 survey lists
 * `/users` as "every account in the installation with no filter"
 * (TENANT-SEPARATION.md §4). Names and email addresses of another company's
 * staff are the most personal rows the app holds, so leaving this one global
 * while the product tables were scoped would keep the leak and hide it behind
 * a screen nobody thinks of as inventory.
 */
export async function listUsersServer(): Promise<UserRow[]> {
  const rows = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          id: authUser.id,
          name: authUser.name,
          email: authUser.email,
          role: authUser.role,
          emailVerified: authUser.emailVerified,
          createdAt: authUser.createdAt,
        })
        .from(authUser)
        .innerJoin(companyMembers, eq(companyMembers.userId, authUser.id))
        .where(eq(companyMembers.companyId, companyId))
        .orderBy(
          sql`case ${authUser.role} when 'admin' then 0 when 'manager' then 1 else 2 end`,
          asc(authUser.name),
        ),
    "listUsersServer",
  );

  return rows.map((r) => ({
    ...r,
    role: (r.role ?? "staff") as UserRole,
  }));
}
