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

    // First arm the trap: wait until base-ui has moved focus INTO the popup.
    await expect(page.locator('[data-slot="command-input"]')).toBeFocused();

    // DEC-021 (corrected): the trap holds, but base-ui returns escaped focus
    // ASYNCHRONOUSLY. The command input is the only tabbable element, and the
    // popup is portaled to the end of <body>; so a Tab first wraps focus to the
    // top of the document (skip-link → sidebar) for ONE frame, then base-ui's
    // focus guard bounces it back via requestAnimationFrame (enqueueFocus,
    // sync:false — node_modules/@base-ui/react/floating-ui-react/utils/
    // enqueueFocus.js:28). A one-shot read right after the keypress samples that
    // pre-rAF frame and sees a false "escape" — which is exactly the bug the
    // DEC-021 principle warns about (never assert on the frame immediately after
    // an async settle). Assert the SETTLED state instead: poll until focus is
    // back off the page-behind. A genuine trap removal (focus stays out) never
    // settles → the poll times out → the test still fails. Reality-proven via
    // Playwright CLI (--repeat-each, deterministic green) and the failure
    // snapshot, which shows focus already returned to the input by capture time.
    const focusEscaped = async () =>
      page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const el = document.activeElement;
        return !!el?.closest("aside, main") && !dlg?.contains(el);
      });

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      await expect.poll(focusEscaped).toBe(false);
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+Tab");
      await expect.poll(focusEscaped).toBe(false);
    }
  });
});
