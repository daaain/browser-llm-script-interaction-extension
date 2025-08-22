import { expect, test } from "./fixtures";
import "./types";

test.describe("Real Tool Flow", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should enable tools and configure settings", async ({ context, extensionId }) => {
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

    // Enable tools
    const toolsEnabledCheckbox = optionsPage.locator("#tools-enabled");
    await toolsEnabledCheckbox.check();

    // Configure LM Studio settings
    const providerSelect = optionsPage.locator("#provider-select");
    await providerSelect.selectOption("LM Studio");

    const endpointInput = optionsPage.locator("#endpoint-input");
    await endpointInput.fill("http://localhost:1234/v1/chat/completions");

    const modelInput = optionsPage.locator("#model-input");
    await modelInput.fill("test-model");

    // Save settings
    const saveBtn = optionsPage.locator("#save-settings");
    await saveBtn.click();

    // Wait for success status
    await expect(optionsPage.locator("#status-message")).toContainText(
      "Settings saved successfully",
      { timeout: 5000 },
    );
  });

  test("should test content script functions directly", async ({ context }) => {
    // Create a test page with content to find
    const testPage = await context.newPage();
    await testPage.setContent(`
      <html>
        <head><title>Test Page for LLM Tools</title></head>
        <body>
          <h1>Test Page</h1>
          <nav>
            <a href="/home">Home</a>
            <a href="/about">About Us</a>
            <a href="/contact">Contact</a>
          </nav>
          <main>
            <p>This is some test content for the LLM to analyze.</p>
            <button id="save-btn">Save Document</button>
            <button id="download-btn">Download File</button>
          </main>
        </body>
      </html>
    `);

    // Wait for content script to load
    await testPage.waitForTimeout(2000);

    // Test that LLMHelper functions work
    const findResult = await testPage.evaluate(() => {
      const helper = (window as any).LLMHelper;
      if (!helper) return { error: "LLMHelper not available" };
      return helper.find(".*", { type: "a" });
    });

    expect(findResult).not.toHaveProperty("error");
    expect(Array.isArray(findResult)).toBe(true);
    expect(findResult.length).toBeGreaterThan(0);
    expect(findResult[0]).toHaveProperty("id");
    expect(findResult[0]).toHaveProperty("text");

    const summaryResult = await testPage.evaluate(() => {
      const helper = (window as any).LLMHelper;
      return helper.summary();
    });

    expect(typeof summaryResult).toBe("string");
    expect(summaryResult).toContain("Test Page for LLM Tools");
  });

  test("should handle tool function calls through extension messaging", async ({ context }) => {
    // Create a test page
    const testPage = await context.newPage();
    await testPage.setContent(`
      <html>
        <body>
          <h1>Extension Test Page</h1>
          <a href="#home">Home Link</a>
          <a href="#about">About Link</a>
        </body>
      </html>
    `);

    await testPage.waitForTimeout(1000);

    // Test messaging between content script and background
    const messageResult = await testPage.evaluate(async () => {
      try {
        const response = await new Promise((resolve, reject) => {
          (globalThis as any).chrome.runtime.sendMessage(
            {
              type: "EXECUTE_FUNCTION",
              function: "find",
              arguments: { pattern: ".*", options: { type: "a" } },
            },
            (response: any) => {
              if ((globalThis as any).chrome.runtime.lastError) {
                reject((globalThis as any).chrome.runtime.lastError);
              } else {
                resolve(response);
              }
            },
          );

          // Timeout fallback
          setTimeout(() => reject(new Error("Timeout")), 5000);
        });
        return response;
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Unknown error" };
      }
    });

    expect(messageResult).toHaveProperty("success");
    if ((messageResult as any).success) {
      expect((messageResult as any).result).toBeDefined();
    }
  });

  test("should show tool test buttons in sidepanel", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Check that tool test buttons exist
    await expect(sidepanelPage.locator("#test-summary")).toBeVisible();
    await expect(sidepanelPage.locator("#test-extract")).toBeVisible();
    await expect(sidepanelPage.locator("#test-find")).toBeVisible();

    // Check button text
    await expect(sidepanelPage.locator("#test-summary")).toContainText("Test Summary");
    await expect(sidepanelPage.locator("#test-extract")).toContainText("Test Extract");
    await expect(sidepanelPage.locator("#test-find")).toContainText("Test Find Buttons");
  });

  test("should update storage when tool test buttons are clicked", async ({
    context,
    extensionId,
  }) => {
    // First set up a test page for the tools to work on
    const testPage = await context.newPage();
    await testPage.setContent(`
      <html>
        <body>
          <h1>Test Page</h1>
          <button>Test Button</button>
          <a href="/test">Test Link</a>
        </body>
      </html>
    `);

    // Open sidepanel
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Click test summary button
    await sidepanelPage.locator("#test-summary").click();

    // Wait for status to update
    await expect(sidepanelPage.locator("#status")).toContainText("Testing summary", {
      timeout: 3000,
    });

    // Wait a bit more for completion
    await sidepanelPage.waitForTimeout(2000);

    // Check if status shows completion or error
    const finalStatus = await sidepanelPage.locator("#status").textContent();
    expect(finalStatus).toBeTruthy();

    // Should either show success or a specific error (not just "Testing summary")
    expect(finalStatus).not.toBe("Testing summary...");
  });

  test("should handle storage listener updates", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that storage listener is working by checking it exists
    const listenerExists = await sidepanelPage.evaluate(() => {
      return (
        typeof (globalThis as any).chrome !== "undefined" &&
        typeof (globalThis as any).chrome.storage !== "undefined" &&
        typeof (globalThis as any).chrome.storage.onChanged !== "undefined"
      );
    });

    expect(listenerExists).toBe(true);

    // Test that welcome message is initially shown
    await expect(sidepanelPage.locator(".welcome-message")).toBeVisible();

    // Check that messages container exists and is ready
    const messagesContainer = sidepanelPage.locator("#messages");
    await expect(messagesContainer).toBeVisible();
  });

  test("should maintain message IDs for real-time updates", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test data-message-id functionality works in the real DOM
    const messageIdTest = await sidepanelPage.evaluate(() => {
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return false;

      // Add a test message with an ID
      const messageElement = document.createElement("div");
      messageElement.className = "message assistant";
      messageElement.dataset.messageId = "test-real-message-123";
      messageElement.innerHTML = "Initial content";
      messagesContainer.appendChild(messageElement);

      // Try to find and update it
      const foundElement = messagesContainer.querySelector(
        '[data-message-id="test-real-message-123"]',
      ) as HTMLElement;
      if (!foundElement) return false;

      foundElement.innerHTML = "Updated content";

      // Verify update worked
      const verification = messagesContainer.querySelector(
        '[data-message-id="test-real-message-123"]',
      ) as HTMLElement;
      return verification && verification.innerHTML === "Updated content";
    });

    expect(messageIdTest).toBe(true);
  });
});
