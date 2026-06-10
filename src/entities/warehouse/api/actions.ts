"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  locations,
  warehouses,
  type Location,
  type Warehouse,
} from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import { withUserContext } from "@/shared/lib/auth/session-binding";
import type { ActionResult } from "@/shared/lib/server-action/types";
import { unexpectedActionError } from "@/shared/lib/server-action/errors";
import {
  locationFormSchema,
  locationIdSchema,
  warehouseFormSchema,
  warehouseIdSchema,
  type LocationFormValues,
  type WarehouseFormValues,
} from "../model/warehouse-schema";

// --- Warehouses ---------------------------------------------------------

export async function createWarehouseAction(
  input: WarehouseFormValues,
): Promise<ActionResult<Warehouse>> {
  const { user } = await requireRole("manager");

  const parsed = warehouseFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid warehouse data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx.insert(warehouses).values(parsed.data).returning(),
    );
    revalidatePath("/catalog/warehouses");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("warehouses_code_idx")) {
      return {
        ok: false,
        error: "That code is already taken.",
        fieldErrors: { code: ["Already in use — pick a different code."] },
      };
    }
    return unexpectedActionError(err, "createWarehouse");
  }
}

export async function updateWarehouseAction(
  id: string,
  input: WarehouseFormValues,
): Promise<ActionResult<Warehouse>> {
  const { user } = await requireRole("manager");

  const idParse = warehouseIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid warehouse id." };

  const parsed = warehouseFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid warehouse data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .update(warehouses)
        .set(parsed.data)
        .where(eq(warehouses.id, idParse.data))
        .returning(),
    );
    if (!row) return { ok: false, error: "Warehouse not found." };
    revalidatePath("/catalog/warehouses");
    revalidatePath(`/catalog/warehouses/${idParse.data}`);
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("warehouses_code_idx")) {
      return {
        ok: false,
        error: "That code is already taken.",
        fieldErrors: { code: ["Already in use — pick a different code."] },
      };
    }
    return unexpectedActionError(err, "updateWarehouse");
  }
}

/**
 * locations.warehouseId is ON DELETE RESTRICT — deleting a warehouse with
 * locations errors at the DB. Surface a clear message instead of raw SQL.
 */
export async function deleteWarehouseAction(
  id: string,
): Promise<ActionResult<Warehouse>> {
  const { user } = await requireRole("manager");

  const idParse = warehouseIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid warehouse id." };

  try {
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .delete(warehouses)
        .where(eq(warehouses.id, idParse.data))
        .returning(),
    );
    if (!row) return { ok: false, error: "Warehouse not found." };
    revalidatePath("/catalog/warehouses");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.toLowerCase().includes("violates foreign key")) {
      return {
        ok: false,
        error: "Delete all locations in this warehouse first.",
      };
    }
    return unexpectedActionError(err, "deleteWarehouse");
  }
}

export async function recreateWarehouseAction(
  row: Warehouse,
): Promise<ActionResult<Warehouse>> {
  const { user } = await requireRole("manager");
  try {
    const [restored] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .insert(warehouses)
        .values(row)
        .onConflictDoNothing()
        .returning(),
    );
    revalidatePath("/catalog/warehouses");
    return { ok: true, data: restored ?? row };
  } catch (err) {
    return unexpectedActionError(err, "recreateWarehouse");
  }
}

// --- Locations ---------------------------------------------------------

export async function createLocationAction(
  warehouseId: string,
  input: LocationFormValues,
): Promise<ActionResult<Location>> {
  const { user } = await requireRole("manager");

  const whParse = warehouseIdSchema.safeParse(warehouseId);
  if (!whParse.success) return { ok: false, error: "Invalid warehouse id." };

  const parsed = locationFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid location data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .insert(locations)
        .values({ ...parsed.data, warehouseId: whParse.data })
        .returning(),
    );
    revalidatePath(`/catalog/warehouses/${whParse.data}`);
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("locations_warehouse_code_idx")) {
      return {
        ok: false,
        error: "Code already used in this warehouse.",
        fieldErrors: { code: ["This warehouse already has a location with that code."] },
      };
    }
    return unexpectedActionError(err, "createLocation");
  }
}

export async function updateLocationAction(
  id: string,
  input: LocationFormValues,
): Promise<ActionResult<Location>> {
  const { user } = await requireRole("manager");

  const idParse = locationIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid location id." };

  const parsed = locationFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid location data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .update(locations)
        .set(parsed.data)
        .where(eq(locations.id, idParse.data))
        .returning(),
    );
    if (!row) return { ok: false, error: "Location not found." };
    revalidatePath(`/catalog/warehouses/${row.warehouseId}`);
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("locations_warehouse_code_idx")) {
      return {
        ok: false,
        error: "Code already used in this warehouse.",
        fieldErrors: { code: ["This warehouse already has a location with that code."] },
      };
    }
    return unexpectedActionError(err, "updateLocation");
  }
}

/**
 * stock_movements.locationId is ON DELETE RESTRICT. Surface a clear message
 * if deletion fails due to recorded movements.
 */
export async function deleteLocationAction(
  id: string,
): Promise<ActionResult<Location>> {
  const { user } = await requireRole("manager");

  const idParse = locationIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid location id." };

  try {
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .delete(locations)
        .where(eq(locations.id, idParse.data))
        .returning(),
    );
    if (!row) return { ok: false, error: "Location not found." };
    revalidatePath(`/catalog/warehouses/${row.warehouseId}`);
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.toLowerCase().includes("violates foreign key")) {
      return {
        ok: false,
        error: "This location has stock movements — delete it via a stock zeroing flow instead.",
      };
    }
    return unexpectedActionError(err, "deleteLocation");
  }
}

export async function recreateLocationAction(
  row: Location,
): Promise<ActionResult<Location>> {
  const { user } = await requireRole("manager");
  try {
    const [restored] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .insert(locations)
        .values(row)
        .onConflictDoNothing()
        .returning(),
    );
    revalidatePath(`/catalog/warehouses/${row.warehouseId}`);
    return { ok: true, data: restored ?? row };
  } catch (err) {
    return unexpectedActionError(err, "recreateLocation");
  }
}
