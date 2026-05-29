export const purchaseOrderKeys = {
  all: ["purchase-order"] as const,
  lists: () => [...purchaseOrderKeys.all, "list"] as const,
  detail: (id: string) => [...purchaseOrderKeys.all, "detail", id] as const,
};
