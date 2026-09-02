import type { Locator, Page } from "@playwright/test";

/**
 * The signed-in role as the shell actually shows it: the topbar profile
 * button renders `<span class="rl" data-slot="user-role">Manager</span>`.
 *
 * Why a scoped `data-slot` and not a text match on the button: every seeded
 * display name contains its own role word ("Admin", "Mira Manager",
 * "Sam Staff"), so `getByText(/staff/i)` inside that button stays green even
 * if the role indicator is deleted. `data-slot` is the hook this codebase
 * already uses for exactly this (see command-palette.journey.spec.ts).
 *
 * The button's accessible name is `aria-label="User menu"` (localised), which
 * matches by substring, so this survives the label gaining a suffix.
 */
export function roleIndicator(page: Page): Locator {
  return page
    .getByRole("button", { name: /user menu/i })
    .locator('[data-slot="user-role"]');
}
