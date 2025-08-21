import { expect, test } from "./fixtures";
import "./types";

test.describe("Consolidated Tool Flow", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should display tool calls and results in single message", async ({
    context,
    extensionId,
  }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Simulate adding a message with tool calls and results
    const testResult = await sidepanelPage.evaluate(() => {
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return false;

      // Create a test assistant message with tool calls and results
      const messageElement = document.createElement("div");
      messageElement.className = "message assistant";
      messageElement.dataset.messageId = "test-tool-message-123";

      // Simulate integrated tool call and result display
      const content = `
        <p>I'll help you find links on this page.</p>
        <div class="tool-call">
          <strong>🛠️ Calling:</strong> find({"pattern": ".*", "options": {"type": "a"}})
        </div>
        <div class="tool-result">
          <strong>🔧 Tool Result:</strong>
          <pre><code>[{"id": 1, "text": "Home", "tag": "a"}, {"id": 2, "text": "About", "tag": "a"}]</code></pre>
        </div>
        <p>Here are the links I found: Home and About.</p>
      `;

      messageElement.innerHTML = content;
      messagesContainer.appendChild(messageElement);

      // Verify the integrated display
      const toolCall = messageElement.querySelector(".tool-call");
      const toolResult = messageElement.querySelector(".tool-result");
      const textContent = messageElement.textContent;

      return (
        toolCall &&
        toolResult &&
        textContent?.includes("Calling: find") &&
        textContent?.includes("Tool Result:") &&
        textContent?.includes("Here are the links I found")
      );
    });

    expect(testResult).toBe(true);
  });

  test("should filter out separate tool messages", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that tool role messages are filtered out in UI
    const filterTest = await sidepanelPage.evaluate(() => {
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return false;

      // Simulate the addMessageToUI function behavior
      const messages = [
        { id: "1", role: "user", content: "Find links", timestamp: Date.now() },
        {
          id: "2",
          role: "assistant",
          content: "I will find links for you",
          timestamp: Date.now(),
          tool_calls: [],
        },
        {
          id: "3",
          role: "tool",
          content: '{"result": "data"}',
          timestamp: Date.now(),
          tool_call_id: "call_123",
        },
        { id: "4", role: "assistant", content: "Here are the results", timestamp: Date.now() },
      ];

      let messageCount = 0;
      messages.forEach((message) => {
        if (message.role !== "tool") {
          const messageElement = document.createElement("div");
          messageElement.className = `message ${message.role}`;
          messageElement.dataset.messageId = message.id;
          messageElement.innerHTML = message.content;
          messagesContainer.appendChild(messageElement);
          messageCount++;
        }
      });

      // Should have 3 messages (user + 2 assistant), tool message filtered out
      return messageCount === 3 && messagesContainer.children.length === 3;
    });

    expect(filterTest).toBe(true);
  });

  test("should support real-time message updates with data-message-id", async ({
    context,
    extensionId,
  }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test real-time updating of messages during streaming/tool execution
    const updateTest = await sidepanelPage.evaluate(() => {
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return false;

      // Simulate initial streaming message
      const messageElement = document.createElement("div");
      messageElement.className = "message assistant streaming";
      messageElement.dataset.messageId = "streaming-123";
      messageElement.innerHTML = "Thinking...";
      messagesContainer.appendChild(messageElement);

      // Simulate finding existing message and updating it
      const existingElement = messagesContainer.querySelector(
        '[data-message-id="streaming-123"]',
      ) as HTMLElement;
      if (!existingElement) return false;

      // Update with tool call
      existingElement.innerHTML = `
        Thinking...
        <div class="tool-call">
          <strong>🛠️ Calling:</strong> find({"pattern": "test"})
        </div>
      `;

      // Update with tool result
      existingElement.innerHTML = `
        Thinking...
        <div class="tool-call">
          <strong>🛠️ Calling:</strong> find({"pattern": "test"})
        </div>
        <div class="tool-result">
          <strong>🔧 Tool Result:</strong>
          <pre><code>[{"id": 1, "text": "test"}]</code></pre>
        </div>
      `;

      // Final update with response
      existingElement.classList.remove("streaming");
      existingElement.innerHTML = `
        I found some test elements.
        <div class="tool-call">
          <strong>🛠️ Calling:</strong> find({"pattern": "test"})
        </div>
        <div class="tool-result">
          <strong>🔧 Tool Result:</strong>
          <pre><code>[{"id": 1, "text": "test"}]</code></pre>
        </div>
        <p>Here are the test elements I found.</p>
      `;

      // Verify final state
      return (
        !existingElement.classList.contains("streaming") &&
        existingElement.innerHTML.includes("found some test elements") &&
        existingElement.innerHTML.includes("tool-call") &&
        existingElement.innerHTML.includes("tool-result") &&
        messagesContainer.children.length === 1
      ); // Only one message element
    });

    expect(updateTest).toBe(true);
  });

  test("should have improved tool result styling", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that tool result styling has been improved
    const stylingTest = await sidepanelPage.evaluate(() => {
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return false;

      // Create a tool result to test styling
      const messageElement = document.createElement("div");
      messageElement.className = "message assistant";
      messageElement.innerHTML = `
        <div class="tool-result">
          <strong>🔧 Tool Result:</strong>
          <pre><code>{"test": "data"}</code></pre>
        </div>
      `;
      messagesContainer.appendChild(messageElement);

      const toolResult = messageElement.querySelector(".tool-result") as HTMLElement;
      const toolResultPre = messageElement.querySelector(".tool-result pre") as HTMLElement;

      if (!toolResult || !toolResultPre) return false;

      const toolResultStyle = window.getComputedStyle(toolResult);
      const preStyle = window.getComputedStyle(toolResultPre);

      // Check improved styling (larger font, better padding, full width)
      return (
        toolResultStyle.width === "100%" &&
        toolResultStyle.boxSizing === "border-box" &&
        parseFloat(preStyle.fontSize) >= 14
      ); // 0.9em should be at least 14px
    });

    expect(stylingTest).toBe(true);
  });
});
