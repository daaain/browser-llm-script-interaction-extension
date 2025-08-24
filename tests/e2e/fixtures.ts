import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BrowserContext, test as base, chromium } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  consoleLogs: string[];
}>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern requires empty destructuring
  context: async ({}, use) => {
    const pathToExtension = path.join(__dirname, "../../.output/chrome-mv3");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // For manifest v3, get service worker and extract extension ID
    let [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker");
    }

    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },
  consoleLogs: async ({ context }, use) => {
    const logs: string[] = [];

    // Listen for console events on all pages
    context.on("page", (page) => {
      page.on("console", (msg) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${msg.type()}: ${msg.text()}`;
        logs.push(logEntry);
        // Also output to test console for real-time debugging
        console.log(`📱 Extension Console: ${logEntry}`);
      });
    });

    // Listen for existing pages
    for (const page of context.pages()) {
      page.on("console", (msg) => {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${msg.type()}: ${msg.text()}`;
        logs.push(logEntry);
        console.log(`📱 Extension Console: ${logEntry}`);
      });
    }

    await use(logs);
  },
});

export const expect = test.expect;
