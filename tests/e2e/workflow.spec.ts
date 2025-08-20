import { expect, test } from "./fixtures";
import { testSettings } from "./test-constants";
import "./types";

test.describe("Complete User Workflow", () => {
  test("should complete full setup and usage workflow", async ({ context, extensionId }) => {
    // Step 1: Configure settings
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

    // Configure LM Studio settings for testing
    await optionsPage.fill("#endpoint-input", testSettings.lmstudio.endpoint);
    await optionsPage.fill("#model-input", testSettings.lmstudio.model);
    await optionsPage.fill("#api-key-input", testSettings.lmstudio.apiKey);

    // Save settings
    await optionsPage.click("#save-settings");
    await optionsPage.waitForTimeout(500);

    // Step 2: Open sidepanel and verify settings are applied
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Verify UI is ready
    await expect(sidepanelPage.locator("h1")).toContainText("LLM Chat");
    await expect(sidepanelPage.locator("#message-input")).toBeVisible();
    await expect(sidepanelPage.locator("#send-btn")).toBeVisible();

    // Step 3: Test message sending (UI only, since we can't test actual LLM)
    const messageInput = sidepanelPage.locator("#message-input");
    const sendBtn = sidepanelPage.locator("#send-btn");

    await messageInput.fill("Hello, can you help me?");
    await expect(sendBtn).toBeEnabled();

    // Click send
    await sendBtn.click();

    // Step 4: Verify the interface handles the interaction
    await sidepanelPage.waitForTimeout(1000);

    // Step 5: Test settings accessibility
    const settingsBtn = sidepanelPage.locator("#settings-btn");
    await expect(settingsBtn).toBeVisible();
    await expect(settingsBtn).toBeEnabled();

    // Step 6: Return to options and test clear history
    await optionsPage.bringToFront();
    const clearBtn = optionsPage.locator("#clear-history");
    await clearBtn.click();

    // Should handle gracefully
    await optionsPage.waitForTimeout(500);
  });

  test("should handle multiple configuration changes", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Test LM Studio configuration
    await page.fill("#endpoint-input", testSettings.lmstudio.endpoint);
    await page.fill("#model-input", testSettings.lmstudio.model);
    await page.click("#save-settings");
    await page.waitForTimeout(300);

    // Switch to OpenAI configuration
    await page.fill("#endpoint-input", testSettings.openai.endpoint);
    await page.fill("#model-input", testSettings.openai.model);
    await page.fill("#api-key-input", testSettings.openai.apiKey);
    await page.click("#save-settings");
    await page.waitForTimeout(300);

    // Verify the latest settings are saved
    await page.reload();
    expect(await page.inputValue("#endpoint-input")).toBe(testSettings.openai.endpoint);
    expect(await page.inputValue("#model-input")).toBe(testSettings.openai.model);
    expect(await page.inputValue("#api-key-input")).toBe(testSettings.openai.apiKey);
  });

  test("should maintain state between page reloads", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Set some configuration
    await page.fill("#endpoint-input", "https://custom-api.example.com/v1/chat");
    await page.fill("#model-input", "custom-model");
    await page.click("#save-settings");
    await page.waitForTimeout(300);

    // Navigate to sidepanel
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Navigate back to options
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Settings should be preserved
    expect(await page.inputValue("#endpoint-input")).toBe("https://custom-api.example.com/v1/chat");
    expect(await page.inputValue("#model-input")).toBe("custom-model");
  });

  test("should handle form validation edge cases", async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Test empty endpoint
    await page.fill("#endpoint-input", "");
    await page.fill("#model-input", "test-model");

    // Try to save - should handle gracefully
    await page.click("#save-settings");
    await page.waitForTimeout(300);

    // Test invalid URL
    await page.fill("#endpoint-input", "not-a-url");
    await page.click("#save-settings");
    await page.waitForTimeout(300);

    // Form should handle validation
    const validity = await page
      .locator("#endpoint-input")
      .evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(validity).toBe(false);

    // Test valid URL
    await page.fill("#endpoint-input", "https://api.example.com/v1/chat/completions");
    const newValidity = await page
      .locator("#endpoint-input")
      .evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(newValidity).toBe(true);
  });
});
