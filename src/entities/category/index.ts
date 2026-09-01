// Client-safe barrel: schemas, keys, and Server Actions (the "use server"
// directive in actions.ts makes them safely callable from client code).
// Server-only DB helpers live in ./api/server and must be imported directly
// from server components, that file's `import "server-only"` is the
// build-time guard that catches accidental client imports.
export {
  categoryFormSchema,
  categoryIdSchema,
  suggestSlug,
  type CategoryFormValues,
} from "./model/category-schema";
export { categoryKeys } from "./api/keys";
export {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  recreateCategoryAction,
} from "./api/actions";
