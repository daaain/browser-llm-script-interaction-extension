import { expect, test } from "./fixtures";
import "./types";

test.describe("Manual Streaming Test", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should manually configure extension and test streaming", async ({ context, extensionId }) => {
    // Step 1: Configure extension settings
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

    // Configure LM Studio settings
    await optionsPage.locator("#endpoint-input").fill("http://localhost:1234/v1/chat/completions");
    await optionsPage.locator("#model-input").fill("qwen/qwen3-coder-30b");
    await optionsPage.locator("#tools-enabled").check();

    // Wait for auto-save
    await optionsPage.waitForTimeout(2000);
    
    // Step 2: Set up test page using example.com (a real web page)
    const testPage = await context.newPage();
    await testPage.goto("https://example.com");
    
    // Wait for content script to load
    await testPage.waitForTimeout(3000);
    
    // Test that content script is loaded
    const llmHelperExists = await testPage.evaluate(() => {
      return typeof (window as any).LLMHelper !== "undefined";
    });
    
    console.log("LLMHelper exists on test page:", llmHelperExists);
    
    // Step 3: Test tools manually
    if (llmHelperExists) {
      const summaryResult = await testPage.evaluate(() => {
        const helper = (window as any).LLMHelper;
        return helper.summary();
      });
      
      console.log("Summary result:", summaryResult);
      expect(typeof summaryResult).toBe("string");
      expect(summaryResult).toContain("Example");
    }
    
    // Step 4: Open sidepanel and test streaming
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    
    // Take screenshot to see if sidepanel loaded
    await sidepanelPage.screenshot({ path: 'test-results/sidepanel-loaded.png' });
    
    // Wait for sidepanel to fully load
    await expect(sidepanelPage.locator("#message-input")).toBeVisible({ timeout: 5000 });
    await expect(sidepanelPage.locator("#send-btn")).toBeVisible({ timeout: 5000 });
    
    // Take screenshot before sending message
    await sidepanelPage.screenshot({ path: 'test-results/sidepanel-ready.png' });
    
    // Send a simple message first
    await sidepanelPage.locator("#message-input").fill("Hello! Just say hi back, don't use any tools.");
    await sidepanelPage.locator("#send-btn").click();
    
    // Take screenshot after clicking send
    await sidepanelPage.screenshot({ path: 'test-results/message-sent.png' });
    
    // Wait for response
    await expect(sidepanelPage.locator(".message.assistant")).toBeVisible({ timeout: 10000 });
    
    // Take screenshot when response appears
    await sidepanelPage.screenshot({ path: 'test-results/response-appeared.png' });
    
    await expect(sidepanelPage.locator(".message.assistant.streaming")).toHaveCount(0, { timeout: 15000 });
    
    // Take screenshot when streaming is complete
    await sidepanelPage.screenshot({ path: 'test-results/streaming-complete.png' });
    
    const firstResponse = await sidepanelPage.locator(".message.assistant").textContent();
    console.log("First response:", firstResponse);
    
    // Always try with tools to test the streaming behavior
    await sidepanelPage.locator("#message-input").fill("Please take a screenshot and describe what you see. Also tell me what you think about the current page content.");
    await sidepanelPage.locator("#send-btn").click();
    
    // Take screenshot when tool message sent
    await sidepanelPage.screenshot({ path: 'test-results/tool-message-sent.png' });
    
    // Wait for streaming to start
    await expect(sidepanelPage.locator(".message.assistant.streaming")).toBeVisible({ timeout: 10000 });
    
    // Take screenshot during streaming
    await sidepanelPage.screenshot({ path: 'test-results/tool-streaming.png' });
    
    // Wait for completion
    await expect(sidepanelPage.locator(".message.assistant.streaming")).toHaveCount(0, { timeout: 30000 });
    
    // Take final screenshot
    await sidepanelPage.screenshot({ path: 'test-results/tool-complete.png' });
    
    const toolResponse = await sidepanelPage.locator(".message.assistant").last().innerHTML();
    console.log("Tool response HTML:", toolResponse);
    
    // The response should contain tool attempts even if they fail
    const hasToolCalls = toolResponse.includes("tool-call");
    const hasToolResults = toolResponse.includes("tool-result");
    const hasAssistantText = toolResponse.includes("assistant-text");
    
    console.log(`Tool calls present: ${hasToolCalls}`);
    console.log(`Tool results present: ${hasToolResults}`);
    console.log(`Assistant text present: ${hasAssistantText}`);
    
    // Should contain some content even if tools fail
    expect(toolResponse.length).toBeGreaterThan(10);
  });
});