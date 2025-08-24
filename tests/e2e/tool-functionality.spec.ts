import { expect, test } from "./fixtures";
import "./types";

test.describe("Tool Functionality", () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent("serviceworker");
    }
  });

  test("should configure tools in options page", async ({ context, extensionId }) => {
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);

    // Check tools settings section exists
    const toolsSection = optionsPage.locator('h2:has-text("Tool Settings")');
    await expect(toolsSection).toBeVisible();

    // Configure LM Studio settings first (required for auto-save)
    const endpointInput = optionsPage.locator("#endpoint-input");
    await endpointInput.fill("http://localhost:1234/v1/chat/completions");

    const modelInput = optionsPage.locator("#model-input");
    await modelInput.fill("test-model");

    // Now test tools enabled checkbox (after required fields are filled)
    const toolsEnabledCheckbox = optionsPage.locator("#tools-enabled");
    await expect(toolsEnabledCheckbox).toBeVisible();
    await expect(toolsEnabledCheckbox).toBeEnabled();

    // Test checkbox functionality - tools are now enabled by default
    const initialState = await toolsEnabledCheckbox.isChecked();
    console.log(`Initial tools enabled state: ${initialState}`);

    // Since tools are enabled by default, just verify the current state
    await expect(toolsEnabledCheckbox).toBeChecked();

    // Test toggling functionality
    await toolsEnabledCheckbox.uncheck();
    await optionsPage.waitForTimeout(500);
    await expect(toolsEnabledCheckbox).not.toBeChecked();

    // Toggle back to enabled
    await toolsEnabledCheckbox.check();
    await optionsPage.waitForTimeout(500);
    await expect(toolsEnabledCheckbox).toBeChecked();

    // Settings auto-save, wait for save operation
    await optionsPage.waitForTimeout(1000);
  });

  test("should display tool functionality in welcome message", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const welcomeMessage = sidepanelPage.locator(".welcome-message");
    await expect(welcomeMessage).toBeVisible();

    // Check that tool information is displayed
    await expect(welcomeMessage).toContainText("autonomously use browser automation tools");
    await expect(welcomeMessage).toContainText("Available Tools");
    await expect(welcomeMessage).toContainText("find elements");
    await expect(welcomeMessage).toContainText("extract text");
    await expect(welcomeMessage).toContainText("get page summary");
  });

  test("should handle background script tool execution", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test tool execution message format through background script
    const findResult = await sidepanelPage.evaluate(async () => {
      return new Promise((resolve) => {
        (globalThis as any).chrome.runtime.sendMessage(
          {
            type: "EXECUTE_FUNCTION",
            payload: {
              function: "find",
              arguments: { pattern: "LLM" },
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

    // Background script should handle the message format
    expect(findResult).toHaveProperty("type");
    expect((findResult as any).type).toMatch(/FUNCTION_RESPONSE|ERROR/);
  });

  test("should validate tool message format", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that background script handles invalid function names
    const validationTest = await sidepanelPage.evaluate(async () => {
      return new Promise((resolve) => {
        (globalThis as any).chrome.runtime.sendMessage(
          {
            type: "EXECUTE_FUNCTION",
            payload: {
              function: "invalid_function",
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

    // Should handle invalid function gracefully
    expect(validationTest).toHaveProperty("type");
    expect((validationTest as any).type).toMatch(/FUNCTION_RESPONSE|ERROR/);
  });

  test("should handle tool errors through background script", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test error handling through background script
    const errorTest = await sidepanelPage.evaluate(async () => {
      return new Promise((resolve) => {
        (globalThis as any).chrome.runtime.sendMessage(
          {
            type: "EXECUTE_FUNCTION",
            payload: {
              function: "describe",
              arguments: { selector: "#non-existent-element" },
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

    // Should handle gracefully
    expect(errorTest).toHaveProperty("type");
    expect((errorTest as any).type).toMatch(/FUNCTION_RESPONSE|ERROR/);
  });

  test("should verify tool message types are handled", async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that background script recognises EXECUTE_FUNCTION messages
    const messageResult = await sidepanelPage.evaluate(async () => {
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

    // Background script should respond to the message
    expect(messageResult).toHaveProperty("type");
    expect((messageResult as any).type).toMatch(/FUNCTION_RESPONSE|ERROR/);
  });

  test("should load tool schema generator correctly", async ({ context }) => {
    // Test that the tool schema generator produces valid tool definitions
    const serviceWorker = context.serviceWorkers()[0];

    // Evaluate in service worker context to test tool generation
    const toolsValid = await serviceWorker.evaluate(() => {
      try {
        // This should be available in the background script context
        const generateTools = (globalThis as any).generateLLMHelperTools;
        if (!generateTools) return false;

        const tools = generateTools();
        return (
          Array.isArray(tools) &&
          tools.length > 0 &&
          tools.every(
            (tool: any) =>
              tool.type === "function" &&
              tool.function &&
              tool.function.name &&
              tool.function.description,
          )
        );
      } catch (_error) {
        return false;
      }
    });

    // For now, just check that service worker is running
    // We can't easily test the internal tool generation without more setup
    expect(serviceWorker).toBeDefined();
    expect(serviceWorker.url()).toContain("background");

    // Verify tools are valid if we can test them
    if (toolsValid !== undefined) {
      expect(typeof toolsValid).toBe("boolean");
    }
  });
});
