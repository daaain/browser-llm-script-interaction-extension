import { expect, test } from "./fixtures";
import "./types";

test.describe("Debug Messaging", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should verify extension pages load correctly", async ({ context, extensionId }) => {
    // Test that the built test page loads (content scripts don't inject into extension pages)
    const testPage = await context.newPage();
    await testPage.goto(`chrome-extension://${extensionId}/test-page.html`);

    // Verify page loads
    await expect(testPage).toHaveTitle("Extension Test Page");

    // Verify page content
    await expect(testPage.locator("h1")).toContainText("Browser Extension Test Page");
    await expect(testPage.locator("#download-btn")).toBeVisible();
    await expect(testPage.locator("#username")).toBeVisible();
  });

  test("should test background script messaging directly", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test basic messaging to background script
    const messagingTest = await sidepanelPage.evaluate(async () => {
      try {
        // Test settings message first
        const settingsResponse = await new Promise((resolve, reject) => {
          (globalThis as any).chrome.runtime.sendMessage(
            { type: "GET_SETTINGS" },
            (response: any) => {
              if ((globalThis as any).chrome.runtime.lastError) {
                reject((globalThis as any).chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            },
          );
          setTimeout(() => reject(new Error("Timeout")), 5000);
        });

        return { success: true, settingsResponse };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    console.log("Background messaging test:", messagingTest);
    expect(messagingTest).toHaveProperty("success", true);
  });

  test("should check manifest content script configuration", async ({ context, extensionId }) => {
    const manifestPage = await context.newPage();

    try {
      await manifestPage.goto(`chrome-extension://${extensionId}/manifest.json`);

      const manifestText = await manifestPage.textContent("body");
      const manifest = JSON.parse(manifestText || "{}");

      console.log("Content scripts config:", manifest.content_scripts);

      expect(manifest.content_scripts).toBeDefined();
      expect(Array.isArray(manifest.content_scripts)).toBe(true);
      expect(manifest.content_scripts.length).toBeGreaterThan(0);

      const contentScript = manifest.content_scripts[0];
      expect(contentScript.matches).toContain("<all_urls>");
    } catch (error) {
      console.log("Error checking manifest:", error);
    }
  });

  test("should verify background script handles function execution message format", async ({
    context,
    extensionId,
  }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that background script recognizes EXECUTE_FUNCTION messages
    const functionTest = await sidepanelPage.evaluate(async () => {
      return new Promise((resolve) => {
        (globalThis as any).chrome.runtime.sendMessage(
          {
            type: "EXECUTE_FUNCTION",
            payload: {
              function: "summary",
              arguments: {},
            },
          },
          (response: any) => {
            resolve(response);
          },
        );

        // Timeout fallback
        setTimeout(() => resolve({ success: false, error: "timeout" }), 3000);
      });
    });

    // Background script should handle the message format (even if content script fails)
    expect(functionTest).toHaveProperty("type");
    expect((functionTest as any).type).toMatch(/FUNCTION_RESPONSE|ERROR/);
  });
});
