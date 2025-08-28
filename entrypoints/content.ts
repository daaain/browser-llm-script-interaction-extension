import browser from 'webextension-polyfill';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createLLMHelper } from '~/utils/llm-helper';
import type { ContentScriptFunctionRequest } from '~/utils/types';

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
                result = LLMHelper.find(args.pattern, args.options);
                break;
              case 'click':
                result = LLMHelper.click(args.selector, args.text);
                break;
              case 'type':
                result = LLMHelper.type(args.selector, args.text, args.options);
                break;
              case 'extract':
                result = LLMHelper.extract(args.selector, args.property);
                break;
              case 'describe':
                result = LLMHelper.describe(args.selector);
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
                LLMHelper.getResponsePage(args.responseId as string, args.page as number)
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
