import browser from "webextension-polyfill";
import { defineContentScript } from 'wxt/utils/define-content-script';
import { createLLMHelper } from '~/utils/llm-helper';

export default defineContentScript({
  matches: ["<all_urls>"],
  main(_ctx) {
    // Create LLMHelper instance
    const LLMHelper = createLLMHelper();

    // Make LLMHelper globally available
    (window as any).LLMHelper = LLMHelper;

    // Listen for messages from the extension
    browser.runtime.onMessage.addListener((request: any, _sender, sendResponse) => {
      if (request.type === "EXECUTE_FUNCTION") {
        try {
          const functionName = request.function;
          const args = request.arguments || {};
          
          if (functionName in LLMHelper) {
            // Handle function arguments properly based on function signature
            let result;
            switch (functionName) {
              case 'find':
                result = LLMHelper.find(args.pattern, args.options);
                break;
              case 'click':
                result = LLMHelper.click(args.selector);
                break;
              case 'type':
                result = LLMHelper.type(args.selector, args.text);
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
                LLMHelper.screenshot().then((dataUrl: string) => {
                  sendResponse({ success: true, result: dataUrl });
                }).catch((error: unknown) => {
                  sendResponse({ 
                    success: false, 
                    error: error instanceof Error ? error.message : "Screenshot failed" 
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
              error: `Function '${functionName}' not found. Available functions: ${availableFunctions}` 
            };
            sendResponse(response);
            return true;
          }
        } catch (error) {
          const response = { 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error" 
          };
          sendResponse(response);
          return true;
        }
      }
      return true; // Keep the message channel open for async responses
    });

    console.debug("LLMHelper content script loaded");
  },
});