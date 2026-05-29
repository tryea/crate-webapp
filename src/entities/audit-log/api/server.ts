import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
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

export async function listAuditLogServer(limit = 500): Promise<AuditRow[]> {
  return db
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
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
