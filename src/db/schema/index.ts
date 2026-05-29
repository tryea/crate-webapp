// Public schema barrel — drizzle-kit reads from here; runtime imports use it
// as the single entry into the DB layer.
export * from "./_shared";
export * from "./users";
export * from "./catalog";
export * from "./warehouses";
export * from "./products";
export * from "./movements";
export * from "./purchase-orders";
export * from "./audit";
