export const warehouseKeys = {
  all: ["warehouse"] as const,
  lists: () => [...warehouseKeys.all, "list"] as const,
  detail: (id: string) => [...warehouseKeys.all, "detail", id] as const,
  locations: (warehouseId: string) =>
    [...warehouseKeys.all, "locations", warehouseId] as const,
};
