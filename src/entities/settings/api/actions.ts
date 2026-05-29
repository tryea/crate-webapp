"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, settings } from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import type { ActionResult } from "@/shared/lib/server-action/types";
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
 * UPSERT via ON CONFLICT — the row may not exist yet on first save.
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
    await db.transaction(async (tx) => {
      await tx
        .insert(settings)
        .values({
          key: STOCK_SETTINGS_KEY,
          value: parsed.data,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: parsed.data,
            updatedAt: new Date(),
          },
        });

      await tx.insert(auditLog).values({
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
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}
// suppress unused-import warning — sql kept for potential future ad-hoc updates
void sql;
