import { expect, test, type Page } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * The filter searches what the screen shows, and says so when it matches nothing.
 *
 * This is the spec that would have caught CPP-FILTER-1. That defect survived
 * because every existing spec typed values the filter happened to support, so
 * the three blind columns and the underscore-vs-space mismatch were never asked
 * about.
 *
 * READ-ONLY on purpose: it types, reads and clicks, and writes nothing. That
 * keeps it safe against any seeded database and free of the E2E-<timestamp>
 * rows the other journeys leave behind.
 *
 * The query is taken FROM THE SCREEN rather than hardcoded, because the claim
 * under test is exactly that a value a person can read is a value they can
 * search. A hardcoded query would still pass on a table that only searches one
 * lucky column.
 */
test.use({ storageState: authFile("manager") });

const NONSENSE = "zzqqxx-no-such-value";

/**
 * The lines of one cell of the first data row, addressed by its column header.
 *
 * Lines, not one string: the Product cell stacks a name over a SKU, so its
 * innerText carries a newline. Handing that whole string to `hasText` never
 * matches, because Playwright compares against text whose whitespace has been
 * normalised. Splitting here keeps each value usable on its own.
 */
async function firstRowCellLines(page: Page, header: string): Promise<string[]> {
  const headers = await page.getByRole("columnheader").allInnerTexts();
  const index = headers.findIndex((h) => h.trim().startsWith(header));
  expect(index, `column "${header}" is on screen`).toBeGreaterThan(-1);

  const firstDataRow = page.getByRole("row").nth(1);
  const cell = firstDataRow.getByRole("cell").nth(index);
  await expect(cell).toBeVisible();
  return (await cell.innerText())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** First line of that cell, which is the value a person would read aloud. */
async function firstRowCell(page: Page, header: string): Promise<string> {
  return (await firstRowCellLines(page, header))[0];
}

test.describe("movements · the filter searches what the screen shows", () => {
  test("a reason spelled the way the screen spells it keeps its rows", async ({
    page,
  }) => {
    await page.goto("/movements");
    await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();

    // Reason is stored with underscores and rendered with spaces. Reading it
    // back off the screen is the whole point: this is what a person would type.
    const reason = await firstRowCell(page, "Reason");
    expect(reason.length).toBeGreaterThan(0);

    const product = await firstRowCell(page, "Product");

    await page.getByPlaceholder(/filter by product/i).fill(reason);

    // The row the value came from must survive its own value.
    await expect(page.getByRole("row").filter({ hasText: product }).first()).toBeVisible();
    await expect(page.getByText(/No match for/)).toBeHidden();
  });

  test("a value only a cell-only column carries is still searchable", async ({
    page,
  }) => {
    await page.goto("/movements");
    await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();

    // Product renders through `cell` with no accessorKey. TanStack skipped it
    // entirely before CPP-FILTER-2, so this query returned nothing.
    const [name, sku] = await firstRowCellLines(page, "Product");
    expect(sku, "the Product cell carries a SKU under the name").toBeTruthy();

    await page.getByPlaceholder(/filter by product/i).fill(sku);

    await expect(page.getByRole("row").filter({ hasText: name }).first()).toBeVisible();
    await expect(page.getByText(/No match for/)).toBeHidden();
  });

  test("a query that matches nothing says so and offers a way back", async ({
    page,
  }) => {
    await page.goto("/movements");
    await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();

    const product = await firstRowCell(page, "Product");

    await page.getByPlaceholder(/filter by product/i).fill(NONSENSE);

    // Not "No movements yet": the movements exist, the filter excluded them.
    await expect(page.getByText(/No match for/)).toBeVisible();
    await expect(page.getByText(NONSENSE)).toBeVisible();
    await expect(page.getByText(/No movements yet/)).toBeHidden();

    await page.getByRole("button", { name: /show all rows/i }).click();

    await expect(page.getByRole("row").filter({ hasText: product }).first()).toBeVisible();
    await expect(page.getByText(/No match for/)).toBeHidden();
  });
});
