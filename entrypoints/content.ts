import browser from 'webextension-polyfill';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createLLMHelper } from '~/utils/llm-helper';
import type { ContentScriptFunctionRequest } from '~/utils/types';

// Validation functions for tool arguments
function validateStringArg(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string, got ${typeof value}`);
  }
  return value;
}

function validateOptionalStringArg(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string or undefined, got ${typeof value}`);
  }
  return value;
}

function validateNumberArg(value: unknown, name: string): number {
  if (typeof value !== 'number') {
    throw new Error(`${name} must be a number, got ${typeof value}`);
  }
  return value;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main(_ctx) {
    // Create LLMHelper instance
    const LLMHelper = createLLMHelper();

    // Make LLMHelper globally available
    (window as typeof window & { LLMHelper: ReturnType<typeof createLLMHelper> }).LLMHelper =
      LLMHelper;

    // Listen for messages from the extension
    browser.runtime.onMessage.addListener((request: unknown, _sender, sendResponse) => {
      const typedRequest = request as ContentScriptFunctionRequest;
      if (typedRequest.type === 'EXECUTE_FUNCTION') {
        try {
          const functionName = typedRequest.function;
          const args = typedRequest.arguments || {};

          if (functionName in LLMHelper) {
            // Handle function arguments properly based on function signature
            let result: unknown;
            switch (functionName) {
              case 'find':
                result = LLMHelper.find(
                  validateStringArg(args.pattern, 'pattern'),
                  args.options as
                    | { limit?: number; type?: string; visible?: boolean; offset?: number }
                    | undefined,
                );
                break;
              case 'click':
                result = LLMHelper.click(
                  validateStringArg(args.selector, 'selector'),
                  validateOptionalStringArg(args.text, 'text'),
                );
                break;
              case 'type':
                result = LLMHelper.type(
                  validateStringArg(args.selector, 'selector'),
                  validateStringArg(args.text, 'text'),
                  args.options as
                    | { clear?: boolean; delay?: number; pressEnter?: boolean }
                    | undefined,
                );
                break;
              case 'extract':
                result = LLMHelper.extract(
                  validateStringArg(args.selector, 'selector'),
                  validateOptionalStringArg(args.property, 'property'),
                );
                break;
              case 'describe':
                result = LLMHelper.describe(validateStringArg(args.selector, 'selector'));
                break;
              case 'summary':
                result = LLMHelper.summary();
                break;
              case 'screenshot':
                // Handle screenshot asynchronously
                LLMHelper.screenshot()
                  .then((dataUrl: string) => {
                    sendResponse({ success: true, result: dataUrl });
                  })
                  .catch((error: unknown) => {
                    sendResponse({
                      success: false,
                      error: error instanceof Error ? error.message : 'Screenshot failed',
                    });
                  });
                return true; // Keep message channel open for async response
              case 'getResponsePage':
                // Handle getResponsePage asynchronously
                LLMHelper.getResponsePage(
                  validateStringArg(args.responseId, 'responseId'),
                  validateNumberArg(args.page, 'page'),
                )
                  .then((result: { result: unknown; _meta: unknown }) => {
                    sendResponse({ success: true, result: result.result, _meta: result._meta });
                  })
                  .catch((error: unknown) => {
                    sendResponse({
                      success: false,
                      error: error instanceof Error ? error.message : 'Get response page failed',
                    });
                  });
                return true; // Keep message channel open for async response
              default:
                throw new Error(`Unknown function: ${functionName}`);
            }
            const response = { success: true, result };
            sendResponse(response);
            return true;
          } else {
            const availableFunctions = Object.keys(LLMHelper).join(', ');
            const response = {
              success: false,
              error: `Function '${functionName}' not found. Available functions: ${availableFunctions}`,
            };
            sendResponse(response);
            return true;
          }
        } catch (error) {
          const response = {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          sendResponse(response);
          return true;
        }
      }
      return true; // Keep the message channel open for async responses
    });

    console.debug('LLMHelper content script loaded');
  },
});
