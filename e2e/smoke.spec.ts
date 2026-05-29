import { test, expect } from "@playwright/test";

test("homepage loads with app title", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBeLessThan(400);
  await expect(page).toHaveTitle(/Crate/);
});
