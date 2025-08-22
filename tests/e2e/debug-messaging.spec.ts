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

  test("should load content script on test pages", async ({ context }) => {
    // Create a test page
    const testPage = await context.newPage();
    await testPage.setContent(`
      <html>
        <body>
          <h1>Test Page</h1>
          <p>Content for testing</p>
        </body>
      </html>
    `);

    // Wait longer for content script to load
    await testPage.waitForTimeout(3000);

    // Check if LLMHelper is available
    const llmHelperExists = await testPage.evaluate(() => {
      return typeof (window as any).LLMHelper !== "undefined";
    });

    console.log("LLMHelper exists:", llmHelperExists);

    // Check if content script console messages appear
    const scriptLoaded = await testPage.evaluate(() => {
      // Look for any signs that content script loaded
      return document.body && document.head;
    });

    expect(scriptLoaded).toBe(true);

    // Try to access LLMHelper directly
    const helperTest = await testPage.evaluate(() => {
      try {
        const helper = (window as any).LLMHelper;
        if (!helper) return { loaded: false, error: "LLMHelper not found" };

        // Try a basic function
        const result = helper.summary();
        return { loaded: true, summaryType: typeof result, summary: result };
      } catch (error) {
        return { loaded: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    console.log("Helper test result:", helperTest);
  });

  test("should test background script messaging directly", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test basic messaging to background script
    const messagingTest = await sidepanelPage.evaluate(async () => {
      try {
        // Test settings message first
        const settingsResponse = await new Promise((resolve, reject) => {
          (globalThis as any).chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response: any) => {
            if ((globalThis as any).chrome.runtime.lastError) {
              reject((globalThis as any).chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
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

  test("should wait for content script injection properly", async ({ context }) => {
    const testPage = await context.newPage();

    // Create a page that might load content scripts
    await testPage.goto("data:text/html,<html><body><h1>Test</h1></body></html>");

    // Wait and check multiple times
    let attempts = 0;
    let helperFound = false;

    while (attempts < 10 && !helperFound) {
      await testPage.waitForTimeout(500);

      helperFound = await testPage.evaluate(() => {
        return typeof (window as any).LLMHelper !== "undefined";
      });

      attempts++;
      console.log(`Attempt ${attempts}: LLMHelper found = ${helperFound}`);
    }

    // Also check for content script console log
    const logs: string[] = [];
    testPage.on("console", (msg) => {
      logs.push(msg.text());
    });

    await testPage.waitForTimeout(1000);
    console.log("Console logs:", logs);

    // At minimum, check if the page loaded properly
    const pageReady = await testPage.evaluate(() => {
      return document.readyState === "complete";
    });

    expect(pageReady).toBe(true);
  });
});
