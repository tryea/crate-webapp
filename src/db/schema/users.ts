import { pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

export const userRoleEnum = pgEnum("user_role", ["admin", "manager", "staff"]);

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name"),
    role: userRoleEnum("role").notNull().default("staff"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
