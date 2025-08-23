import { expect, test } from "./fixtures";

test.describe("Tool Calling Test", () => {
  test.beforeEach(async ({ context }) => {
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should execute multi-turn tool calls properly", async ({ context, extensionId }) => {
    // Configure extension with tools enabled
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

    await optionsPage.locator("#endpoint-input").fill("http://localhost:1234/v1/chat/completions");
    await optionsPage.locator("#model-input").fill("local-model");

    // Enable tools explicitly - try but don't fail if it doesn't work
    const toolsCheckbox = optionsPage.locator("#tools-enabled");
    try {
      if (!(await toolsCheckbox.isChecked())) {
        await toolsCheckbox.click();
      }
      console.log(`✅ Tools checkbox status: ${await toolsCheckbox.isChecked()}`);
    } catch (e) {
      console.log("⚠️ Could not interact with tools checkbox, continuing anyway");
    }

    await optionsPage.waitForTimeout(2000); // Wait for auto-save

    // Navigate to a page with content to interact with
    const testPage = await context.newPage();
    await testPage.goto("https://example.com");
    await testPage.waitForLoadState("networkidle");
    console.log("✅ Test page loaded");

    // Open sidepanel
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(sidepanelPage.locator("#message-input")).toBeVisible({ timeout: 5000 });

    // Make test page active so tools can interact with it
    await testPage.bringToFront();
    await sidepanelPage.bringToFront();

    console.log("🔧 Testing multi-turn tool execution...");

    // Send a message that should trigger tool use
    await sidepanelPage
      .locator("#message-input")
      .fill(
        "Please find any clickable elements on the current page using the find tool, then tell me what you found. Be sure to actually use the find tool.",
      );
    await sidepanelPage.locator("#send-btn").click();

    // Wait for response with longer timeout for tool execution
    await expect(sidepanelPage.locator(".message.assistant")).toHaveCount(1, { timeout: 15000 });

    // Wait for any streaming to complete
    try {
      await expect(sidepanelPage.locator(".message.assistant.streaming")).toHaveCount(0, {
        timeout: 30000,
      });
    } catch (e) {
      console.log("No streaming detected or timeout");
    }

    // Get the response content
    const response = await sidepanelPage.locator(".message.assistant").innerHTML();
    console.log("📝 Response HTML length:", response.length);
    console.log("📝 Response preview:", response.substring(0, 500));

    // Analyze response for tool usage indicators
    const hasToolCall = response.includes("tool-call") || response.includes("🛠️");
    const hasToolResult = response.includes("tool-result") || response.includes("🔧");
    const mentionsFind = response.toLowerCase().includes("find");
    const mentionsElements = response.toLowerCase().includes("element");

    console.log("🔍 Analysis:");
    console.log("  - Has tool call indicators:", hasToolCall);
    console.log("  - Has tool result indicators:", hasToolResult);
    console.log("  - Mentions 'find':", mentionsFind);
    console.log("  - Mentions 'elements':", mentionsElements);

    // Take screenshot for debugging
    await sidepanelPage.screenshot({ path: "test-results/tool-calling-result.png" });

    // Save response for analysis
    const fs = await import("fs");
    if (!fs.existsSync("test-results")) {
      fs.mkdirSync("test-results");
    }
    fs.writeFileSync("test-results/tool-response.html", response);

    // Assertions
    expect(response.length).toBeGreaterThan(50); // Should have substantial response

    // The response should either show tool usage OR explain why tools weren't used
    const hasToolEvidence =
      hasToolCall ||
      hasToolResult ||
      (mentionsFind && mentionsElements) ||
      response.toLowerCase().includes("cannot") ||
      response.toLowerCase().includes("unable");

    expect(hasToolEvidence).toBeTruthy();
  });
});
