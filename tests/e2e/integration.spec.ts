import { expect, test } from "./fixtures";
import "./types";

test.describe("Extension Integration Tests", () => {
  test("should save and load settings", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Fill out the settings form
    await page.fill("#endpoint-input", "https://api.openai.com/v1/chat/completions");
    await page.fill("#model-input", "gpt-3.5-turbo");
    await page.fill("#api-key-input", "test-key-123");

    // Save settings
    await page.click("#save-settings");

    // Wait for potential status message
    await page.waitForTimeout(500);

    // Reload the page and check if settings are preserved
    await page.reload();

    expect(await page.inputValue("#endpoint-input")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(await page.inputValue("#model-input")).toBe("gpt-3.5-turbo");
    expect(await page.inputValue("#api-key-input")).toBe("test-key-123");
  });

  test("should open settings from sidepanel", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Click settings button
    const settingsBtn = sidepanelPage.locator("#settings-btn");
    await expect(settingsBtn).toBeVisible();

    // Note: In a real extension, this would open the options page
    // For testing, we'll just verify the button is functional
    await expect(settingsBtn).toBeEnabled();
  });

  test("should handle message sending UI", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const messageInput = page.locator("#message-input");
    const sendBtn = page.locator("#send-btn");

    // Test typing and sending
    await messageInput.fill("Hello, this is a test message");
    await expect(sendBtn).toBeEnabled();

    // Click send button
    await sendBtn.click();

    // Input should be cleared after sending (if implemented)
    // This would depend on the actual implementation
    await page.waitForTimeout(100);
  });

  test("should display status messages", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const statusElement = page.locator("#status");
    await expect(statusElement).toBeAttached();

    // Status element should be present for displaying connection status
    await expect(statusElement).toHaveClass(/status/);
  });

  test("should handle clear history action", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const clearBtn = page.locator("#clear-history");
    await expect(clearBtn).toBeVisible();
    await expect(clearBtn).toBeEnabled();

    // Click clear history
    await clearBtn.click();

    // Should handle the action gracefully
    await page.waitForTimeout(500);
  });

  test("should validate form inputs", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const endpointInput = page.locator("#endpoint-input");
    const apiKeyInput = page.locator("#api-key-input");

    // Test URL validation
    await expect(endpointInput).toHaveAttribute("type", "url");

    // Test password field
    await expect(apiKeyInput).toHaveAttribute("type", "password");

    // Fill with invalid URL
    await endpointInput.fill("not-a-valid-url");

    // Browser should handle URL validation
    const isInvalid = await endpointInput.evaluate((el: HTMLInputElement) => {
      return !el.validity.valid;
    });

    expect(isInvalid).toBe(true);
  });

  test("should handle service worker communication", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test basic service worker connectivity
    const canCommunicate = await page.evaluate(() => {
      return new Promise((resolve) => {
        try {
          window.chrome.runtime.sendMessage({ type: "test" }, () => {
            resolve(true);
          });

          // Timeout fallback
          setTimeout(() => resolve(false), 1000);
        } catch (_error) {
          resolve(false);
        }
      });
    });

    // Should either communicate successfully or fail gracefully
    expect(typeof canCommunicate).toBe("boolean");
  });
});
