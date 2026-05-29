export const stockMovementKeys = {
  all: ["stock-movement"] as const,
  lists: () => [...stockMovementKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown>) =>
    [...stockMovementKeys.lists(), filters ?? {}] as const,
  levelsAll: () => [...stockMovementKeys.all, "levels"] as const,
  level: (productId: string, locationId: string) =>
    [...stockMovementKeys.levelsAll(), productId, locationId] as const,
};
