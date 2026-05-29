/**
 * TanStack Query keys for the category entity. Per state-management
 * contract §1: every entity owns its keys + hooks; mutations invalidate
 * by these keys.
 */
export const categoryKeys = {
  all: ["category"] as const,
  lists: () => [...categoryKeys.all, "list"] as const,
  detail: (id: string) => [...categoryKeys.all, "detail", id] as const,
};
