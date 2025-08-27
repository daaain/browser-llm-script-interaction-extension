import { expect, test } from './fixtures';
import './types';

test.describe('Streaming Functionality', () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent('serviceworker');
    }
  });

  test('should show streaming indicator CSS class', async ({ context, extensionId }) => {
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Check that streaming CSS class exists in stylesheet
    const streamingCSSExists = await sidepanelPage.evaluate(() => {
      const styleSheets = Array.from(document.styleSheets);
      for (const sheet of styleSheets) {
        try {
          const rules = Array.from(sheet.cssRules || []);
          for (const rule of rules) {
            if (rule.cssText.includes('.streaming') || rule.cssText.includes('message.streaming')) {
              return true;
            }
          }
        } catch (_e) {
          // Cross-origin stylesheets may not be accessible
        }
      }
      return false;
    });

    expect(streamingCSSExists).toBe(true);
  });

  test('should stream text with real LLM API and tool calls', async ({ context, extensionId }) => {
    test.skip(process.env.CI === 'true', 'This test requires LLM API access and is skipped in CI');
    // First configure the extension
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.locator('#endpoint-input').fill('http://localhost:1234/v1/chat/completions');
    await optionsPage.locator('#model-input').fill('qwen/qwen3-coder-30b');

    // Enable tools by forcing the checkbox to be checked
    const toolsCheckbox = optionsPage.locator('#tools-enabled');

    // Force set the checkbox via JavaScript to bypass any UI issues
    await optionsPage.evaluate(() => {
      const checkbox = document.getElementById('tools-enabled') as HTMLInputElement;
      if (checkbox && !checkbox.checked) {
        checkbox.checked = true;
        // Trigger change event to notify the form
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await optionsPage.waitForTimeout(1000); // Wait for auto-save

    // Verify it's now checked
    const finalState = await toolsCheckbox.isChecked();
    console.log(`Tools checkbox final state: ${finalState}`);
    await optionsPage.waitForTimeout(2000); // Wait for auto-save

    // Set up test page for tools to interact with - use a real website since content scripts don't run on extension pages
    const testPage = await context.newPage();
    await testPage.goto('https://example.com');

    // Open sidepanel
    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Track streaming updates
    const streamingUpdates: string[] = [];
    let isStreaming = false;

    // Monitor DOM changes for streaming
    await sidepanelPage.evaluate(() => {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' || mutation.type === 'characterData') {
            const assistantMessages = document.querySelectorAll('.message.assistant');
            const lastMessage = assistantMessages[assistantMessages.length - 1] as HTMLElement;
            if (lastMessage) {
              (window as any).lastMessageUpdate = {
                content: lastMessage.innerHTML,
                isStreaming: lastMessage.classList.contains('streaming'),
                timestamp: Date.now(),
              };
            }
          }
        });
      });

      const messagesEl = document.getElementById('messages');
      if (messagesEl) {
        observer.observe(messagesEl, {
          childList: true,
          subtree: true,
          characterData: true,
        });
      }
    });

    // Send a simple message first to verify basic streaming works
    const messageInput = sidepanelPage.locator('#message-input');
    await messageInput.fill('Hello! Just say hi back.');

    const sendBtn = sidepanelPage.locator('#send-btn');
    await sendBtn.click();

    // Wait for streaming to start
    await expect(sidepanelPage.locator('.message.assistant.streaming')).toBeVisible({
      timeout: 10000,
    });

    // Wait for streaming to complete
    await expect(sidepanelPage.locator('.message.assistant.streaming')).toHaveCount(0, {
      timeout: 15000,
    });

    // Verify we got a response
    const firstResponse = await sidepanelPage.locator('.message.assistant').textContent();
    expect(firstResponse).toBeTruthy();
    expect(firstResponse).toMatch(/(hi|hello)/i);

    // Now send a message that should trigger tool calls (even if tools fail, we can test the UI)
    await messageInput.fill('Please take a screenshot and describe what you see.');
    await sendBtn.click();

    // Wait for streaming to start
    await expect(sidepanelPage.locator('.message.assistant.streaming')).toBeVisible({
      timeout: 10000,
    });

    // Collect streaming updates
    let streamingComplete = false;
    let checkCount = 0;
    const maxChecks = 50; // 25 seconds max

    while (!streamingComplete && checkCount < maxChecks) {
      await sidepanelPage.waitForTimeout(500);

      const update = await sidepanelPage.evaluate(() => {
        return (window as any).lastMessageUpdate;
      });

      if (update) {
        streamingUpdates.push(update.content);
        isStreaming = update.isStreaming;

        if (!update.isStreaming) {
          streamingComplete = true;
        }
      }

      checkCount++;
    }

    // Verify streaming behavior
    expect(streamingUpdates.length).toBeGreaterThan(1); // Should have multiple updates
    expect(isStreaming).toBe(false); // Should have finished streaming

    // Check final message - should contain tool calls even if they fail
    const finalMessage = await sidepanelPage.locator('.message.assistant').last();
    const finalContent = await finalMessage.innerHTML();

    // Check if tools were actually used (depends on LLM capability)
    const hasToolCalls = finalContent.includes('tool-call');
    const hasToolResults = finalContent.includes('tool-result');
    const mentionsScreenshot = finalContent.toLowerCase().includes('screenshot');

    console.log(`Tool calls present: ${hasToolCalls}`);
    console.log(`Tool results present: ${hasToolResults}`);
    console.log(`Mentions screenshot: ${mentionsScreenshot}`);

    if (hasToolCalls) {
      // If tool calls are present, expect tool results too
      expect(finalContent).toContain('tool-result');
      console.log('✅ Tool functionality working - found tool calls and results');
    } else {
      // If no tool calls, at least the LLM should acknowledge the request
      expect(mentionsScreenshot).toBeTruthy();
      console.log('ℹ️ No tool calls found, but LLM acknowledged the request');
    }

    // Verify message is no longer streaming
    await expect(sidepanelPage.locator('.message.assistant.streaming')).toHaveCount(0);
  });

  test('should stream simple text without tool calls', async ({ context, extensionId }) => {
    test.skip(process.env.CI === 'true', 'This test requires LLM API access and is skipped in CI');
    // Configure the extension first
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options.html`);
    await optionsPage.locator('#endpoint-input').fill('http://localhost:1234/v1/chat/completions');
    await optionsPage.locator('#model-input').fill('qwen/qwen3-coder-30b');
    await optionsPage.waitForTimeout(2000); // Wait for auto-save

    const sidepanelPage = await context.newPage();
    await sidepanelPage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Send a simple message that shouldn't trigger tools
    const messageInput = sidepanelPage.locator('#message-input');
    await messageInput.fill(
      'Just say hello and explain what you are in a few sentences. No tools needed.',
    );

    const sendBtn = sidepanelPage.locator('#send-btn');
    await sendBtn.click();

    // Wait for streaming to start
    await expect(sidepanelPage.locator('.message.assistant.streaming')).toBeVisible({
      timeout: 10000,
    });

    // Wait for streaming to complete
    await expect(sidepanelPage.locator('.message.assistant.streaming')).toHaveCount(0, {
      timeout: 15000,
    });

    // Verify final message
    const finalMessage = await sidepanelPage.locator('.message.assistant').last();
    const finalContent = await finalMessage.textContent();

    expect(finalContent).toMatch(/(hello|assistant|AI)/i);
    expect(finalContent).not.toContain('tool-call');
    expect(finalContent).not.toContain('tool-result');
  });
});
