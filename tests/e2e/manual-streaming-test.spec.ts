import { expect, test } from "./fixtures";
import "./types";
import * as fs from "node:fs";

// See: https://github.com/microsoft/playwright/issues/15684
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

test.describe("Manual Streaming Test", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should manually configure extension and test streaming with network capture", async ({
    context,
    extensionId,
  }) => {
    // Create results directory if it doesn't exist
    if (!fs.existsSync("test-results")) {
      fs.mkdirSync("test-results");
    }

    // Array to store captured API responses
    const apiResponses: any[] = [];
    let responseCounter = 0;

    // Network response handler to capture LLM API calls from ALL contexts
    const handleResponse = async (response: any) => {
      try {
        const url = response.url();
        if (
          url.includes("chat/completions") ||
          url.includes("v1/chat") ||
          url.includes("localhost:1234")
        ) {
          responseCounter++;
          const responseData = {
            id: responseCounter,
            url: url,
            status: response.status(),
            timestamp: new Date().toISOString(),
            headers: await response.allHeaders(),
          };

          // Try to get response body (may be streaming)
          try {
            const responseText = await response.text();
            responseData.body = responseText;
            console.log(`📡 Captured LLM API Response #${responseCounter}:`, {
              url: responseData.url,
              status: responseData.status,
              bodyLength: responseText.length,
              bodyPreview:
                responseText.substring(0, 200) + (responseText.length > 200 ? "..." : ""),
            });
          } catch (error) {
            responseData.body = `[Failed to read body: ${error.message}]`;
            console.log(
              `📡 Captured LLM API Response #${responseCounter} (no body):`,
              responseData.url,
            );
          }

          apiResponses.push(responseData);

          // Save each response immediately
          fs.writeFileSync(
            `test-results/api-response-${responseCounter}.json`,
            JSON.stringify(responseData, null, 2),
          );
        }
      } catch (error) {
        console.error("Error handling response:", error);
      }
    };

    // Set up network interception on the entire browser context (not just one page)
    context.on("response", handleResponse);

    // Step 1: Configure extension settings
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

    // Configure LM Studio settings
    await optionsPage.locator("#endpoint-input").fill("http://localhost:1234/v1/chat/completions");
    await optionsPage.locator("#model-input").fill("qwen/qwen3-coder-30b");
    await optionsPage.locator("#tools-enabled").check();

    // Wait for auto-save
    await optionsPage.waitForTimeout(2000);

    // Verify settings were saved
    const savedEndpoint = await optionsPage.locator("#endpoint-input").inputValue();
    const savedModel = await optionsPage.locator("#model-input").inputValue();
    console.log(`⚙️ Saved settings - Endpoint: ${savedEndpoint}, Model: ${savedModel}`);

    // Step 2: Skip external page for now and focus on the chat functionality
    console.log("⏭️ Skipping external page setup for debugging");

    // Step 3: Open sidepanel
    const sidepanelPage = await context.newPage();

    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Wait for sidepanel to fully load
    await expect(sidepanelPage.locator("#message-input")).toBeVisible({ timeout: 5000 });
    await expect(sidepanelPage.locator("#send-btn")).toBeVisible({ timeout: 5000 });

    console.log("🚀 Starting test with network capture enabled...");

    // Test 1: Simple message without tools
    console.log("📝 Test 1: Simple message without tools");
    await sidepanelPage
      .locator("#message-input")
      .fill("Hello! Just say hi back briefly, don't use any tools.");
    await sidepanelPage.locator("#send-btn").click();

    // Wait for response
    await expect(sidepanelPage.locator(".message.assistant")).toBeVisible({ timeout: 10000 });
    await expect(sidepanelPage.locator(".message.assistant.streaming")).toHaveCount(0, {
      timeout: 15000,
    });

    const firstResponse = await sidepanelPage.locator(".message.assistant").textContent();
    console.log("✅ First response received:", firstResponse?.substring(0, 100));

    // Test 2: Message with text-based tool calls that should work
    console.log("📝 Test 2: Message with text-based tool calls");
    await sidepanelPage
      .locator("#message-input")
      .fill(
        "Please find an element with text 'Example' on the current page and click it. Then get the page summary. Use the findElement and click tools.",
      );
    await sidepanelPage.locator("#send-btn").click();

    // Take screenshot right after sending
    await sidepanelPage.screenshot({ path: "test-results/after-tool-message-send.png" });

    console.log("⏳ Waiting for ANY assistant message to appear...");
    // First, just wait for any assistant message to appear
    await expect(sidepanelPage.locator(".message.assistant")).toHaveCount(2, {
      timeout: 15000,
    });

    // Take screenshot when message appears
    await sidepanelPage.screenshot({ path: "test-results/assistant-message-appeared.png" });

    // Check if streaming class exists
    const streamingCount = await sidepanelPage.locator(".message.assistant.streaming").count();
    console.log(`📊 Streaming messages found: ${streamingCount}`);

    if (streamingCount > 0) {
      console.log("⏳ Waiting for streaming to complete...");
      // Wait for completion with longer timeout for tool calls
      await expect(sidepanelPage.locator(".message.assistant.streaming")).toHaveCount(0, {
        timeout: 45000,
      });
    } else {
      console.log("ℹ️  No streaming detected, message may have completed immediately");
    }

    const toolResponse = await sidepanelPage.locator(".message.assistant").last().innerHTML();
    console.log("✅ Tool response received, length:", toolResponse.length);

    // Save the final conversation state
    const allMessages = await sidepanelPage.locator(".message").allInnerTexts();
    fs.writeFileSync(
      "test-results/conversation-messages.json",
      JSON.stringify(allMessages, null, 2),
    );

    // Save all captured API responses
    fs.writeFileSync("test-results/all-api-responses.json", JSON.stringify(apiResponses, null, 2));

    console.log(`📊 Test completed. Captured ${apiResponses.length} API responses.`);
    console.log(`💬 Final conversation has ${allMessages.length} messages.`);

    // Analyze the responses
    const hasToolCalls = toolResponse.includes("tool-call");
    const hasToolResults = toolResponse.includes("tool-result");
    const hasAssistantText = toolResponse.includes("assistant-text");

    console.log(`🔧 Tool calls present: ${hasToolCalls}`);
    console.log(`📋 Tool results present: ${hasToolResults}`);
    console.log(`💬 Assistant text present: ${hasAssistantText}`);

    // Basic assertions
    expect(apiResponses.length).toBeGreaterThan(0);
    expect(toolResponse.length).toBeGreaterThan(10);
    expect(allMessages.length).toBeGreaterThan(2);
  });
});
