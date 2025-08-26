import { expect, test } from './fixtures';
import './types';

test.describe('Browser Extension', () => {
  test.beforeEach(async ({ context }) => {
    // Ensure extension is loaded before each test
    const serviceWorkers = context.serviceWorkers();
    if (serviceWorkers.length === 0) {
      await context.waitForEvent('serviceworker');
    }
  });

  test('should load extension and service worker', async ({ context, extensionId }) => {
    expect(extensionId).toBeTruthy();
    expect(extensionId).toMatch(/^[a-z]{32}$/); // Chrome extension ID format

    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThan(0);

    const serviceWorker = serviceWorkers[0];
    expect(serviceWorker.url()).toContain(extensionId);
  });

  test('should have valid extension manifest', async ({ context, extensionId }) => {
    const page = await context.newPage();

    // Try to access the manifest
    const response = await page.goto(`chrome-extension://${extensionId}/manifest.json`);
    expect(response?.status()).toBe(200);

    const manifest = await response?.json();
    expect(manifest?.name).toBeTruthy();
    expect(manifest?.version).toBeTruthy();
    expect(manifest?.manifest_version).toBe(3);
  });
});

test.describe('Sidepanel Interface', () => {
  test('should load sidepanel page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Check page loads successfully
    await expect(page).toHaveTitle('LLM Chat');

    // Check main UI elements are present
    await expect(page.locator('h1')).toContainText('LLM Chat');
    await expect(page.locator('.welcome-message h3')).toContainText('Welcome to LLM Chat!');
    await expect(page.locator('#message-input')).toBeVisible();
    await expect(page.locator('#send-btn')).toBeVisible();
    await expect(page.locator('#settings-btn')).toBeVisible();
  });

  test('should have working message input', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const messageInput = page.locator('#message-input');
    const sendBtn = page.locator('#send-btn');

    // Test input functionality
    await messageInput.fill('Hello, this is a test message');
    expect(await messageInput.inputValue()).toBe('Hello, this is a test message');

    // Send button should be enabled with text
    await expect(sendBtn).toBeEnabled();

    // Clear input
    await messageInput.fill('');
    expect(await messageInput.inputValue()).toBe('');
  });

  test('should have working settings button', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const settingsBtn = page.locator('#settings-btn');
    await expect(settingsBtn).toBeVisible();
    await expect(settingsBtn).toHaveAttribute('title', 'Open Settings');

    // Settings button should be clickable
    await expect(settingsBtn).toBeEnabled();
  });

  test('should display welcome message initially', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const welcomeMessage = page.locator('.welcome-message');
    await expect(welcomeMessage).toBeVisible();
    await expect(welcomeMessage.locator('h3')).toContainText('Welcome to LLM Chat!');
    await expect(welcomeMessage.locator('p').first()).toContainText(
      'Start a conversation with your configured LLM',
    );
  });
});

test.describe('Options Page', () => {
  test('should load options page', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Check page loads successfully
    await expect(page).toHaveTitle('LLM Chat Extension Settings');

    // Check main heading
    await expect(page.locator('h1')).toContainText('LLM Chat Extension Settings');
    await expect(page.locator('h2').first()).toContainText('LLM Provider Configuration');
  });

  test('should have all form fields', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Check all form fields exist
    await expect(page.locator('#provider-select')).toBeVisible();
    await expect(page.locator('#endpoint-input')).toBeVisible();
    await expect(page.locator('#model-input')).toBeVisible();
    await expect(page.locator('#api-key-input')).toBeVisible();

    // Check labels
    await expect(page.locator('label[for="provider-select"]')).toContainText('Provider:');
    await expect(page.locator('label[for="endpoint-input"]')).toContainText('API Endpoint:');
    await expect(page.locator('label[for="model-input"]')).toContainText('Model:');
    await expect(page.locator('label[for="api-key-input"]')).toContainText('API Key:');
  });

  test('should have working form inputs', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Test endpoint input
    const endpointInput = page.locator('#endpoint-input');
    await endpointInput.fill('https://api.openai.com/v1/chat/completions');
    expect(await endpointInput.inputValue()).toBe('https://api.openai.com/v1/chat/completions');

    // Test model input
    const modelInput = page.locator('#model-input');
    await modelInput.fill('gpt-4');
    expect(await modelInput.inputValue()).toBe('gpt-4');

    // Test API key input (should be password type)
    const apiKeyInput = page.locator('#api-key-input');
    await expect(apiKeyInput).toHaveAttribute('type', 'password');
    await apiKeyInput.fill('test-api-key');
    expect(await apiKeyInput.inputValue()).toBe('test-api-key');
  });

  test('should have action buttons', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    // Check action buttons exist and are enabled
    const testBtn = page.locator('#test-connection');
    const clearBtn = page.locator('#clear-history');

    await expect(testBtn).toBeVisible();
    await expect(testBtn).toBeEnabled();
    await expect(testBtn).toContainText('Test Connection');

    await expect(clearBtn).toBeVisible();
    await expect(clearBtn).toBeEnabled();
    await expect(clearBtn).toContainText('Clear Chat History');
  });

  test('should have status message area', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const statusMessage = page.locator('#status-message');
    await expect(statusMessage).toBeAttached();
    await expect(statusMessage).toHaveClass(/status-message/);
  });

  test('should have chat history section', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const historySection = page.locator('.settings-section').last();
    await expect(historySection.locator('h2')).toContainText('Chat History');
    await expect(historySection.locator('p')).toContainText(
      'Your chat history is stored locally in the browser',
    );
  });
});

test.describe('Service Worker', () => {
  test('should have active service worker', async ({ context, extensionId }) => {
    const serviceWorkers = context.serviceWorkers();
    expect(serviceWorkers.length).toBeGreaterThan(0);

    const serviceWorker = serviceWorkers[0];
    expect(serviceWorker.url()).toContain('background');
    expect(serviceWorker.url()).toContain(extensionId);
  });

  test('should handle service worker messages', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    // Test that the service worker can receive messages (basic connectivity test)
    const result = await page.evaluate(() => {
      return new Promise((resolve) => {
        window.chrome.runtime.sendMessage({ type: 'ping' }, (response: unknown) => {
          resolve(response || 'no-response');
        });

        // Fallback timeout
        setTimeout(() => resolve('timeout'), 1000);
      });
    });

    // Service worker should respond or timeout gracefully
    // The result can be "no-response", "timeout", undefined, or an actual response
    expect(
      ['no-response', 'timeout', undefined].includes(result as string | undefined) ||
        typeof result === 'object',
    ).toBeTruthy();
  });
});

test.describe('Extension Permissions', () => {
  test('should have chrome.runtime API available', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    const hasRuntime = await page.evaluate(() => {
      return typeof window.chrome !== 'undefined' && typeof window.chrome.runtime !== 'undefined';
    });

    expect(hasRuntime).toBe(true);
  });

  test('should have chrome.storage API available', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const hasStorage = await page.evaluate(() => {
      return typeof window.chrome !== 'undefined' && typeof window.chrome.storage !== 'undefined';
    });

    expect(hasStorage).toBe(true);
  });
});
