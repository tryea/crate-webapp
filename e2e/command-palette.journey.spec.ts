import { test, expect, type Page } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * issue-017 regression guard — the command palette must OPEN, not crash.
 *
 * The P0 it locks down: `CommandDialog` (shared/ui/command.tsx) used to render
 * `Dialog > DialogContent > {children}` WITHOUT wrapping the children in the
 * `<Command>` root, so cmdk's store context (`createContext(undefined)`) had no
 * provider and every `Command.Input/List/Item` threw
 * `Cannot read properties of undefined (reading 'subscribe')` on mount → the
 * route-level error boundary replaced the whole page. tsc/lint/Jest were all
 * green (a missing *runtime* provider is invisible to them); only a test that
 * actually OPENS the palette catches it. That test did not exist — this is it.
 *
 * Assertions are i18n-independent where it matters: the open/no-crash guard and
 * focus-restore use structural hooks (`role="dialog"`, `[data-slot]`,
 * `:focus`), and navigation is asserted by URL, not by translated copy. The one
 * concession to copy is filtering on the English default-locale label
 * ("movements"), which is what the harness runs under.
 *
 * Runs in the DB-gated `journeys` project, reusing the manager storageState
 * (zero login cost — DEC-010). The palette lives in the protected shell, so it
 * needs an authenticated session; it does not touch the DB itself.
 */
test.use({ storageState: authFile("manager") });

const launcher = (page: Page) =>
  page.getByRole("button", { name: /open command palette/i });
const dialog = (page: Page) => page.getByRole("dialog");
const items = (page: Page) => page.locator('[data-slot="command-item"]');

test.describe("command palette · open + operate (issue-017 regression)", () => {
  test("opens via launcher without crashing and renders items", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(launcher(page)).toBeVisible();

    await launcher(page).click();

    // The P0 guard: a dialog appears AND the error boundary did NOT.
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    // Items rendering at all proves the cmdk store/provider is wired.
    await expect(items(page).first()).toBeVisible();
    expect(await items(page).count()).toBeGreaterThan(1);
  });

  test("filters, navigates on Enter, then closes + restores focus on Escape", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();

    // Focus lands inside the dialog on open (focus management).
    await expect(page.locator('[data-slot="command-input"]')).toBeFocused();

    // Filter to a single known route, then Enter executes its onSelect → push.
    await page.locator('[data-slot="command-input"]').fill("movements");
    await expect(items(page).filter({ hasText: /movements/i }).first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/movements/);

    // Re-open via the keyboard shortcut (Cmd/Ctrl+K) — the other entry path.
    await page.keyboard.press("ControlOrMeta+k");
    await expect(dialog(page)).toBeVisible();

    // Escape closes AND returns focus to the launcher (WCAG 2.4.3 focus restore).
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(launcher(page)).toBeFocused();
  });

  test("traps focus while open — Tab/Shift+Tab never reach the page behind", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await launcher(page).click();
    await expect(dialog(page)).toBeVisible();

    const focusEscaped = async () =>
      page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const el = document.activeElement;
        return !!el?.closest("aside, main") && !dlg?.contains(el);
      });

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await focusEscaped()).toBe(false);
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusEscaped()).toBe(false);
    }
  });
});
