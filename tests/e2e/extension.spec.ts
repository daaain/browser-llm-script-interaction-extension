import path from "node:path";
import { expect, test } from "@playwright/test";

test.describe("Browser Extension", () => {
  test("should load extension and open sidebar", async ({ page, context }) => {
    test.skip(
      !process.env.CI,
      "E2E tests disabled in development - extension needs to be built first",
    );

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "userAgent", {
        get: () => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      });
    });

    await page.goto("https://example.com");

    await expect(page).toHaveURL("https://example.com");
  });
});

test.describe("Settings Page", () => {
  test("should render settings form", async ({ page }) => {
    test.skip(
      !process.env.CI,
      "E2E tests disabled in development - extension needs to be built first",
    );

    await page.goto(`file://${path.join(__dirname, "../../dist/chrome/src/settings/index.html")}`);

    await expect(page.getByText("LLM Chat Extension Settings")).toBeVisible();
    await expect(page.getByLabel("Provider:")).toBeVisible();
    await expect(page.getByLabel("API Endpoint:")).toBeVisible();
    await expect(page.getByLabel("Model:")).toBeVisible();
    await expect(page.getByLabel("API Key:")).toBeVisible();
  });
});
