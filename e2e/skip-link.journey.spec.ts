import { test, expect, type Page } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * task-#99 regression guard — WCAG 2.4.1 (Bypass Blocks, Level A).
 *
 * The protected shell renders sidebar + topbar before page content, so a
 * keyboard user would otherwise Tab through every nav link on every page
 * before reaching the main region. The fix is a skip link in
 * `src/app/(protected)/layout.tsx`: an `sr-only focus:not-sr-only` anchor that
 * is the FIRST focusable element and targets a `#main-content` wrapper
 * (`tabIndex={-1}`) placed AFTER the sidebar/topbar in the DOM.
 *
 * This was reality-confirmed missing during the keyboard audit (it passed
 * axe's automated pass because axe does not model "first Tab reaches a working
 * bypass"). Only a test that actually drives Tab → Enter → Tab catches a
 * regression, e.g. someone reordering the layout or dropping `tabIndex={-1}`
 * (which makes the hash update but leaves focus stranded — a silent failure).
 *
 * Assertions are i18n-independent: the link is matched by its `href`
 * (`#main-content`) and the focus target by its `id`, never by the translated
 * "Skip to content" copy.
 *
 * Runs in the DB-gated `journeys` project, reusing the manager storageState
 * (zero login cost — DEC-010). The shell is protected, so it needs an
 * authenticated session; it does not touch the DB.
 */
test.use({ storageState: authFile("manager") });

const blurActive = (page: Page) =>
  page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

test.describe("skip link · bypass blocks (task-#99 / WCAG 2.4.1)", () => {
  test("first Tab surfaces the skip link, Enter jumps past sidebar to content", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    await blurActive(page);

    // Tab #1: the skip link is the very first focusable element and becomes
    // visible on focus (sr-only → focus:not-sr-only).
    await page.keyboard.press("Tab");
    const tab1 = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const r = el.getBoundingClientRect();
      return {
        href: el.getAttribute("href"),
        visible: r.width > 1 && r.height > 1 && r.top >= 0,
      };
    });
    expect(tab1.href).toBe("#main-content");
    expect(tab1.visible).toBe(true);

    // Enter activates it → focus moves to the #main-content wrapper.
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe(
      "main-content",
    );

    // Tab #2: from #main-content, the next focusable element is INSIDE the
    // main region — sidebar + topbar (earlier in the DOM) are bypassed.
    await page.keyboard.press("Tab");
    const escaped = await page.evaluate(() => {
      const el = document.activeElement;
      const main = document.getElementById("main-content");
      const insideMain = !!main && main.contains(el);
      return { insideMain, inChrome: !!el?.closest("aside, header") && !insideMain };
    });
    expect(escaped.insideMain).toBe(true);
    expect(escaped.inChrome).toBe(false);
  });
});
