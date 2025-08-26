import { tool } from 'ai';
import { z } from 'zod/v3';
import browser from 'webextension-polyfill';
import type { ContentScriptFunctionRequest, ContentScriptFunctionResponse } from './types';

/**
 * AI SDK Tool Definitions
 *
 * These tools provide the LLM with the ability to interact with web pages
 * through browser automation. Each tool is defined using the AI SDK's tool()
 * function with Zod schemas for type safety and automatic validation.
 */

/**
 * Convert string boolean values to actual booleans recursively
 */
function convertStringBooleans(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Convert string "true"/"false" to boolean, case-insensitive
    const lowerStr = obj.toLowerCase();
    if (lowerStr === 'true') return true;
    if (lowerStr === 'false') return false;
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(convertStringBooleans);
  }

  if (typeof obj === 'object') {
    const converted: any = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertStringBooleans(value);
    }
    return converted;
  }

  return obj;
}

/**
 * Zod preprocessor for converting string booleans to actual booleans
 */
const booleanPreprocessor = (val: any) => {
  if (typeof val === 'string') {
    const lowerStr = val.toLowerCase();
    if (lowerStr === 'true') return true;
    if (lowerStr === 'false') return false;
  }
  return val;
};

/**
 * Helper to create a boolean schema with string boolean preprocessing
 */
const booleanWithStringConversion = () => z.preprocess(booleanPreprocessor, z.boolean());

/**
 * Execute a function in the content script context
 */
async function executeContentScriptFunction(
  functionName: string,
  args: any,
): Promise<ContentScriptFunctionResponse> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    if (!activeTab?.id) {
      throw new Error('No active tab found');
    }

    // Convert string booleans to actual booleans to handle LLM parameter issues
    const convertedArgs = convertStringBooleans(args);

    const message: ContentScriptFunctionRequest = {
      type: 'EXECUTE_FUNCTION',
      function: functionName,
      arguments: convertedArgs,
    };

    const response = (await browser.tabs.sendMessage(
      activeTab.id,
      message,
    )) as ContentScriptFunctionResponse;

    if (!response.success) {
      throw new Error(response.error || `Failed to execute ${functionName}`);
    }

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error executing content script function ${functionName}:`, error);

    // Provide more specific error information for debugging
    if (errorMessage.includes('not found')) {
      console.warn(
        `Tool '${functionName}' is not implemented in the content script. Check if it needs to be added to the llm-helper.ts interface and content script switch statement.`,
      );
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Screenshot Tool
 * Captures a screenshot of the current page or viewport
 */
export const screenshotTool = tool({
  description:
    'Capture a screenshot of the current page. Use this to see what the user is looking at or to analyze visual content.',
  inputSchema: z.object({
    fullPage: booleanWithStringConversion()
      .optional()
      .default(false)
      .describe('Whether to capture the full page (true) or just the visible viewport (false)'),
  }),
  execute: async ({ fullPage }) => {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      if (!activeTab?.id) {
        throw new Error('No active tab found');
      }

      // Capture screenshot using browser API
      const dataUrl = await browser.tabs.captureVisibleTab(undefined, {
        format: 'png',
        quality: 90,
      });

      return {
        type: 'screenshot',
        success: true,
        dataUrl,
        timestamp: Date.now(),
        fullPage,
      };
    } catch (error) {
      console.error('Screenshot capture error:', error);
      return {
        type: 'screenshot',
        success: false,
        error: error instanceof Error ? error.message : 'Screenshot capture failed',
      };
    }
  },
});

/**
 * Find Elements Tool
 * Find elements on the page by text content or CSS selector
 */
export const findElementsTool = tool({
  description: 'Find elements on the current page by text pattern or CSS selector. Returns details about matching elements including their text content, attributes, and position.',
  inputSchema: z.object({
    pattern: z.string().describe('Text pattern to search for or CSS selector (e.g., "button", ".class-name", "#id", or "download" for text search)'),
    options: z.object({
      limit: z.number()
        .optional()
        .default(10)
        .describe('Maximum number of elements to return'),
      includeHidden: booleanWithStringConversion()
        .optional()
        .default(false)
        .describe('Whether to include hidden elements'),
      searchType: z.enum(['text', 'selector', 'auto'])
        .optional()
        .default('auto')
        .describe('Type of search: text (search by text content), selector (CSS selector), auto (detect automatically)')
    }).optional()
  }),
  execute: async ({ pattern, options = {} }) => {
    const result = await executeContentScriptFunction('find', { 
      pattern, 
      options: {
        limit: options?.limit ?? 10,
        includeHidden: options?.includeHidden ?? false,
        searchType: options?.searchType ?? 'auto'
      }
    });
    
    return result.success ? result.result : { error: result.error };
  }
});

/**
 * Extract Text Tool
 * Extract text content from specific elements or the entire page
 */
export const extractTextTool = tool({
  description: 'Extract text content from the page. Can extract from specific elements using selectors or get all text content.',
  inputSchema: z.object({
    selector: z.string()
      .optional()
      .describe('CSS selector to extract text from specific elements. If not provided, extracts all page text.'),
    options: z.object({
      includeLinks: booleanWithStringConversion()
        .optional()
        .default(true)
        .describe('Whether to include link text'),
      includeButtons: booleanWithStringConversion()
        .optional()
        .default(true)
        .describe('Whether to include button text'),
      maxLength: z.number()
        .optional()
        .default(5000)
        .describe('Maximum length of extracted text'),
      format: z.enum(['plain', 'structured'])
        .optional()
        .default('plain')
        .describe('Format of output: plain (simple text) or structured (with element types)')
    }).optional()
  }),
  execute: async ({ selector, options = {} }) => {
    const result = await executeContentScriptFunction('extract', { 
      selector,
      options: {
        includeLinks: options?.includeLinks !== false,
        includeButtons: options?.includeButtons !== false,
        maxLength: options?.maxLength || 5000,
        format: options?.format || 'plain'
      }
    });
    
    return result.success ? result.result : { error: result.error };
  }
});

/**
 * Page Summary Tool
 * Get a summary of the current page including title, main content, and key elements
 */
export const summarizeTool = tool({
  description: 'Get a comprehensive summary of the current page including title, URL, main headings, key content, and important interactive elements.',
  inputSchema: z.object({
    includeMetadata: booleanWithStringConversion()
      .optional()
      .default(true)
      .describe('Whether to include page metadata (title, URL, description)'),
    includeHeadings: booleanWithStringConversion()
      .optional()
      .default(true)
      .describe('Whether to include page headings structure'),
    includeInteractiveElements: booleanWithStringConversion()
      .optional()
      .default(true)
      .describe('Whether to include buttons, forms, and links'),
    contentLength: z.enum(['brief', 'detailed'])
      .optional()
      .default('detailed')
      .describe('Level of detail in the summary')
  }),
  execute: async ({ includeMetadata = true, includeHeadings = true, includeInteractiveElements = true, contentLength = 'detailed' }) => {
    const result = await executeContentScriptFunction('summary', { 
      includeMetadata,
      includeHeadings,
      includeInteractiveElements,
      contentLength
    });
    
    return result.success ? result.result : { error: result.error };
  }
});

/**
 * Click Element Tool
 * Click on an element by selector or text content
 */
export const clickTool = tool({
  description: 'Click on an element on the page. Useful for interacting with buttons, links, or other clickable elements.',
  inputSchema: z.object({
    selector: z.string()
      .optional()
      .describe('CSS selector of the element to click'),
    text: z.string()
      .optional()
      .describe('Text content of the element to click (alternative to selector)'),
    options: z.object({
      waitAfter: z.number()
        .optional()
        .default(1000)
        .describe('Milliseconds to wait after clicking'),
      scrollIntoView: booleanWithStringConversion()
        .optional()
        .default(true)
        .describe('Whether to scroll element into view before clicking')
    }).optional()
  }),
  execute: async ({ selector, text, options = {} }) => {
    if (!selector && !text) {
      return { 
        success: false, 
        error: 'Either selector or text must be provided' 
      };
    }

    const result = await executeContentScriptFunction('click', { 
      selector,
      text,
      options: {
        waitAfter: options?.waitAfter || 1000,
        scrollIntoView: options?.scrollIntoView !== false
      }
    });
    
    return result.success ? result.result : { error: result.error };
  }
});

/**
 * Type Text Tool
 * Type text into an input field or text area
 */
export const typeTool = tool({
  description: 'Type text into an input field, textarea, or other editable element on the page.',
  inputSchema: z.object({
    selector: z.string()
      .optional()
      .describe('CSS selector of the input element'),
    text: z.string()
      .describe('Text to type into the element'),
    options: z.object({
      clear: booleanWithStringConversion()
        .optional()
        .default(true)
        .describe('Whether to clear existing content before typing'),
      delay: z.number()
        .optional()
        .default(100)
        .describe('Delay between keystrokes in milliseconds'),
      pressEnter: booleanWithStringConversion()
        .optional()
        .default(false)
        .describe('Whether to press Enter after typing')
    }).optional()
  }),
  execute: async ({ selector, text, options = {} }) => {
    const result = await executeContentScriptFunction('type', { 
      selector,
      text,
      options: {
        clear: options?.clear !== false,
        delay: options?.delay || 100,
        pressEnter: options?.pressEnter || false
      }
    });
    
    return result.success ? result.result : { error: result.error };
  }
});



/**
 * Collection of all available tools
 * This object is used by the AI SDK to provide tools to the LLM
 */
export const availableTools = {
  screenshot: screenshotTool,
  find: findElementsTool,
  extract: extractTextTool,
  summary: summarizeTool,
  click: clickTool,
  type: typeTool,
};

/**
 * Get tools based on configuration
 * Allows enabling/disabling specific tool categories
 */
export function getConfiguredTools(config: {
  enableScreenshot?: boolean;
  enablePageInteraction?: boolean;
  enableTextExtraction?: boolean;
} = {}): Record<string, any> {
  const {
    enableScreenshot = true,
    enablePageInteraction = true,
    enableTextExtraction = true,
  } = config;

  const tools: Record<string, any> = {};

  if (enableScreenshot) {
    tools.screenshot = screenshotTool;
  }

  if (enableTextExtraction) {
    tools.find = findElementsTool;
    tools.extract = extractTextTool;
    tools.summary = summarizeTool;
  }

  if (enablePageInteraction) {
    tools.click = clickTool;
    tools.type = typeTool;
  }


  return tools;
}

/**
 * Tool descriptions for UI display
 */
export const toolDescriptions = {
  screenshot: 'Capture page screenshots',
  find: 'Find elements by text or selector',
  extract: 'Extract text content from page',
  summary: 'Get page summary and overview',
  click: 'Click on page elements',
  type: 'Type text into input fields',
};