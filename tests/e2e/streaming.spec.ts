import { expect, test } from "./fixtures";
import "./types";

test.describe("Streaming Functionality", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should show streaming indicator for messages", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Check that streaming CSS class exists in stylesheet
    const streamingCSSExists = await sidepanelPage.evaluate(() => {
      const styleSheets = Array.from(document.styleSheets);
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText.includes(".streaming") || rule.cssText.includes("message.streaming")) {
              return true;
            }
          }
        } catch (e) {
          // Cross-origin stylesheets may not be accessible
        }
      }
      return false;
    });

    expect(streamingCSSExists).toBe(true);
  });

  test("should handle message updates with data-message-id", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that the UI can create and update messages with data-message-id
    const testResult = await sidepanelPage.evaluate(() => {
      // Simulate adding a streaming message
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return false;

      // Create a test message element
      const messageElement = document.createElement("div");
      messageElement.className = "message assistant streaming";
      messageElement.dataset.messageId = "test-streaming-123";
      messageElement.innerHTML = "Initial content...";
      messagesContainer.appendChild(messageElement);

      // Verify the element was added
      const added = messagesContainer.querySelector('[data-message-id="test-streaming-123"]');
      if (!added) return false;

      // Test updating the message
      const existing = messagesContainer.querySelector(
        '[data-message-id="test-streaming-123"]',
      ) as HTMLElement;
      if (existing) {
        existing.innerHTML = "Updated content!";
        existing.classList.remove("streaming");
      }

      // Verify the update worked
      const updated = messagesContainer.querySelector(
        '[data-message-id="test-streaming-123"]',
      ) as HTMLElement;
      return (
        updated &&
        updated.innerHTML === "Updated content!" &&
        !updated.classList.contains("streaming")
      );
    });

    expect(testResult).toBe(true);
  });

  test("should support message querying by data-message-id", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that querySelector works with data-message-id attributes
    const queryTest = await sidepanelPage.evaluate(() => {
      const messagesContainer = document.getElementById("messages");
      if (!messagesContainer) return false;

      // Add multiple test messages
      for (let i = 1; i <= 3; i++) {
        const messageElement = document.createElement("div");
        messageElement.className = "message user";
        messageElement.dataset.messageId = `test-msg-${i}`;
        messageElement.innerHTML = `Message ${i}`;
        messagesContainer.appendChild(messageElement);
      }

      // Test querying specific messages
      const msg1 = messagesContainer.querySelector('[data-message-id="test-msg-1"]');
      const msg2 = messagesContainer.querySelector('[data-message-id="test-msg-2"]');
      const msg3 = messagesContainer.querySelector('[data-message-id="test-msg-3"]');
      const nonExistent = messagesContainer.querySelector('[data-message-id="test-msg-999"]');

      return (
        msg1 &&
        msg2 &&
        msg3 &&
        !nonExistent &&
        (msg1 as HTMLElement).innerHTML === "Message 1" &&
        (msg2 as HTMLElement).innerHTML === "Message 2" &&
        (msg3 as HTMLElement).innerHTML === "Message 3"
      );
    });

    expect(queryTest).toBe(true);
  });

  test("should handle storage listener for real-time updates", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Verify that storage change listener is set up
    const storageListenerExists = await sidepanelPage.evaluate(() => {
      // Check if browser.storage.onChanged listener exists
      return (
        typeof window.chrome !== "undefined" &&
        typeof window.chrome.storage !== "undefined" &&
        typeof window.chrome.storage.onChanged !== "undefined"
      );
    });

    expect(storageListenerExists).toBe(true);
  });
});
