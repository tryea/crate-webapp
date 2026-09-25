import "server-only";
import { desc, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
import { auditLog, user as authUser } from "@/db/schema";

export interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  userName: string | null;
  userEmail: string | null;
  diff: unknown;
  createdAt: Date;
}

/**
 * The audit trail of one company. The `diff` column carries before and after
 * values of domain rows, so an unscoped read here leaks the contents of the
 * other company's records and not merely their existence.
 *
 * ON THE JOIN TO `user`. `user` is Better Auth's table and has no
 * `company_id`; membership lives in `company_members`. The join is left as it
 * is on purpose: it is a lookup of the actor named by a row that has already
 * been narrowed to this company, so it can only reach an account that acted
 * inside it. `listUsersServer` is the surface where the roster itself is read,
 * and that one filters through the membership table.
 */
export async function listAuditLogServer(limit = 500): Promise<AuditRow[]> {
  return withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select({
          id: auditLog.id,
          action: auditLog.action,
          resourceType: auditLog.resourceType,
          resourceId: auditLog.resourceId,
          userName: authUser.name,
          userEmail: authUser.email,
          diff: auditLog.diff,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .leftJoin(authUser, eq(auditLog.userId, authUser.id))
        .where(eq(auditLog.companyId, companyId))
        .orderBy(desc(auditLog.createdAt))
        .limit(limit),
    "listAuditLogServer",
  );
}
