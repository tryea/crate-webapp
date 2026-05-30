import { test, expect } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * task-#99 regression guard — WCAG 2.1.1 (Keyboard) / axe
 * `scrollable-region-focusable`.
 *
 * The shared DataTable (`src/shared/ui/data-table/data-table.tsx`) renders its
 * virtualized rows inside an `overflow-auto` container with a clamped height
 * (`max-h-[70svh]`). That container overflows and holds only read-only cells —
 * no focusable descendants — so a keyboard-only user had no way to scroll it
 * (axe flagged it "serious" on /movements). The seam fix makes the container a
 * tab stop (`tabIndex={0}`, gated on `virtualize` so short non-overflowing
 * tables don't get a dead focus stop) with a `focus-visible` inset ring.
 *
 * This guard is i18n-independent and dependency-free (no @axe-core/playwright):
 * it drives the actual keyboard behaviour the axe rule stands in for — the
 * region is focusable and PageDown scrolls it. If someone drops the tabIndex,
 * `scrollTop` stays 0 and this fails.
 *
 * Runs in the DB-gated `journeys` project (DEC-010), reusing the manager
 * storageState; /movements needs real seeded rows to overflow.
 */
test.use({ storageState: authFile("manager") });

test.describe("data table · scrollable region keyboard access (task-#99)", () => {
  test("virtualized scroll region is focusable and scrolls via keyboard", async ({
    page,
  }) => {
    await page.goto("/movements");
    await page.waitForLoadState("networkidle");

    const region = page.locator(".overflow-auto").first();
    await expect(region).toHaveAttribute("tabindex", "0");

    // It must actually overflow, otherwise the scroll assertion is vacuous.
    const metrics = await region.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    // Focus the region and confirm it received focus.
    await region.evaluate((el: HTMLElement) => el.focus());
    expect(
      await region.evaluate((el) => el === document.activeElement),
    ).toBe(true);

    // PageDown scrolls the focused region (the keyboard affordance the axe
    // rule exists to guarantee).
    const before = await region.evaluate((el) => el.scrollTop);
    await page.keyboard.press("PageDown");
    await expect
      .poll(async () => region.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(before);
  });
});
