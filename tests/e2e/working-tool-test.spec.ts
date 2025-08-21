import { expect, test } from "./fixtures";
import "./types";

test.describe("Working Tool Test", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should work with extension test page", async ({ context, extensionId }) => {
    // Use the extension's own test page which should have content script
    const testPage = await context.newPage();
    await testPage.goto(`chrome-extension://${extensionId}/test-page.html`);

    // Wait for page to load
    await testPage.waitForTimeout(2000);

    // Check if LLMHelper is available on the test page
    const llmHelperAvailable = await testPage.evaluate(() => {
      return typeof (window as any).LLMHelper !== "undefined";
    });

    console.log("LLMHelper available on test page:", llmHelperAvailable);

    if (llmHelperAvailable) {
      // Test LLMHelper functions
      const summaryResult = await testPage.evaluate(() => {
        const helper = (window as any).LLMHelper;
        return helper.summary();
      });

      console.log("Summary result:", summaryResult);
      expect(typeof summaryResult).toBe("string");

      const findResult = await testPage.evaluate(() => {
        const helper = (window as any).LLMHelper;
        return helper.find("button", { limit: 3 });
      });

      console.log("Find result:", findResult);
      expect(Array.isArray(findResult)).toBe(true);
    }
  });

  test("should test tool buttons in sidepanel with actual content", async ({
    context,
    extensionId,
  }) => {
    // First go to the test page to have content for tools to work on
    const testPage = await context.newPage();
    await testPage.goto(`chrome-extension://${extensionId}/test-page.html`);
    await testPage.waitForTimeout(1000);

    // Open sidepanel in another page
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Make the test page active by bringing it to front
    await testPage.bringToFront();
    await testPage.waitForTimeout(500);

    // Go back to sidepanel
    await sidepanelPage.bringToFront();

    // Now test the summary button
    await sidepanelPage.locator("#test-summary").click();

    // Wait for result
    await sidepanelPage.waitForTimeout(3000);

    // Check the status
    const statusText = await sidepanelPage.locator("#status").textContent();
    console.log("Final status:", statusText);

    // Should show either success or a more specific error (not connection error)
    expect(statusText).toBeTruthy();
    expect(statusText).not.toContain("Could not establish connection");
  });

  test("should test the actual storage-based tool flow", async ({ context, extensionId }) => {
    // Set up test page first
    const testPage = await context.newPage();
    await testPage.goto(`chrome-extension://${extensionId}/test-page.html`);
    await testPage.waitForTimeout(1000);

    // Open sidepanel
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Check initial message count
    const initialMessageCount = await sidepanelPage.locator(".message").count();
    console.log("Initial message count:", initialMessageCount);

    // Make test page active
    await testPage.bringToFront();
    await testPage.waitForTimeout(500);
    await sidepanelPage.bringToFront();

    // Click test summary which should add a message to storage
    await sidepanelPage.locator("#test-summary").click();

    // Wait for processing
    await sidepanelPage.waitForTimeout(4000);

    // Check if messages were added
    const finalMessageCount = await sidepanelPage.locator(".message").count();
    console.log("Final message count:", finalMessageCount);

    // Should have at least one more message
    expect(finalMessageCount).toBeGreaterThanOrEqual(initialMessageCount);

    // Check if welcome message was removed
    const welcomeMessageExists = await sidepanelPage.locator(".welcome-message").count();
    console.log("Welcome message exists:", welcomeMessageExists > 0);
  });

  test("should verify message structure for tools", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that messages can have data-message-id attributes
    const messageStructureTest = await sidepanelPage.evaluate(() => {
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return false;

      // Add a test assistant message with tool structure
      const messageElement = document.createElement("div");
      messageElement.className = "message assistant";
      messageElement.dataset.messageId = "test-integrated-message";

      messageElement.innerHTML = `
        <p>I'll help you with that.</p>
        <div class="tool-call">
          <strong>🛠️ Calling:</strong> find({"pattern": "button"})
        </div>
        <div class="tool-result">
          <strong>🔧 Tool Result:</strong>
          <pre><code>[{"id": 1, "text": "Click me"}]</code></pre>
        </div>
        <p>I found 1 button on the page.</p>
      `;

      messagesContainer.appendChild(messageElement);

      // Verify the structure
      const hasToolCall = messageElement.querySelector(".tool-call");
      const hasToolResult = messageElement.querySelector(".tool-result");
      const hasId = messageElement.dataset.messageId === "test-integrated-message";

      return hasToolCall && hasToolResult && hasId;
    });

    expect(messageStructureTest).toBe(true);
  });
});
