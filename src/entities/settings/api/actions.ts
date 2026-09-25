"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { auditLog, settings } from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import { withCompanyContext } from "@/shared/lib/auth/company-context";
import type { ActionResult } from "@/shared/lib/server-action/types";
import { unexpectedActionError } from "@/shared/lib/server-action/errors";
import {
  STOCK_SETTINGS_KEY,
  stockSettingsFormSchema,
  type StockSettings,
  type StockSettingsFormValues,
} from "../model/settings-schema";

/**
 * Update stock-domain settings. Admin-only per RBAC matrix (settings
 * affect every operator's experience). Wrapped in a transaction so the
 * audit row commits with the settings change.
 *
 * UPSERT via ON CONFLICT: the row may not exist yet on first save.
 *
 * THE CONFLICT TARGET IS THE COMPANY'S ROW, NOT THE INSTALLATION'S (ticket
 * 1009). `settings` keyed on `key` alone held one row per config domain for
 * everybody, and this upsert targeted it: a second company saving its
 * backorder switch did not get a row, it overwrote the first company's value
 * and then read the defaults itself, because the read has carried a company
 * predicate since ticket 1004. With the primary key now `(company_id, key)`
 * the target names both columns, so each company's save lands on its own row
 * and inserts one when it has none. A bare `settings.key` target no longer
 * matches a unique index at all and would fail the save outright, which is the
 * safer of the two ways to be wrong and is not the way this is wrong.
 */
export async function updateStockSettingsAction(
  input: StockSettingsFormValues,
): Promise<ActionResult<StockSettings>> {
  const { user } = await requireRole("admin");

  const parsed = stockSettingsFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid settings.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    await withCompanyContext(user.id, user.role, async (tx, companyId) => {
      await tx
        .insert(settings)
        .values({
          key: STOCK_SETTINGS_KEY,
          value: parsed.data,
          updatedAt: new Date(),
          companyId,
        })
        .onConflictDoUpdate({
          target: [settings.companyId, settings.key],
          set: {
            value: parsed.data,
            updatedAt: new Date(),
          },
        });

      await tx.insert(auditLog).values({
        companyId,
        userId: user.id,
        action: "update",
        resourceType: "settings",
        resourceId: null,
        diff: {
          key: STOCK_SETTINGS_KEY,
          ...parsed.data,
        },
      });
    });

    revalidatePath("/settings");
    revalidatePath("/movements/new/stock-out");
    revalidatePath("/movements/new/transfer");
    return { ok: true, data: parsed.data };
  } catch (err) {
    return unexpectedActionError(err, "updateStockSettings");
  }
}
// suppress unused-import warning, sql kept for potential future ad-hoc updates
void sql;
