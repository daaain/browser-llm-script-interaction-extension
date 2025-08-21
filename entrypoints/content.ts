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
            const result = (LLMHelper as any)[functionName](...Object.values(args));
            const response = { success: true, result };
            sendResponse(response);
          } else {
            const response = { 
              success: false, 
              error: `Function ${functionName} not found` 
            };
            sendResponse(response);
          }
        } catch (error) {
          const response = { 
            success: false, 
            error: error instanceof Error ? error.message : "Unknown error" 
          };
          sendResponse(response);
        }
      }
      return true; // Keep the message channel open for async responses
    });

    console.log("LLMHelper content script loaded");
  },
});