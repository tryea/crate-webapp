// Client-safe barrel. Server-only DB helpers live in ./api/server.
export {
  productFormSchema,
  productIdSchema,
  type ProductFormValues,
} from "./model/product-schema";
export { productKeys } from "./api/keys";
export {
  createProductAction,
  updateProductAction,
  deleteProductAction,
  recreateProductAction,
  setProductActiveAction,
} from "./api/actions";
