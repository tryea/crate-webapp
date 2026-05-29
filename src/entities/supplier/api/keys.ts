export const supplierKeys = {
  all: ["supplier"] as const,
  lists: () => [...supplierKeys.all, "list"] as const,
  detail: (id: string) => [...supplierKeys.all, "detail", id] as const,
};
