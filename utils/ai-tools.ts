import { tool } from 'ai';
import { z } from 'zod';
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
 * Execute a function in the content script context
 */
async function executeContentScriptFunction(
  functionName: string, 
  args: any
): Promise<ContentScriptFunctionResponse> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    
    if (!activeTab?.id) {
      throw new Error('No active tab found');
    }

    const message: ContentScriptFunctionRequest = {
      type: 'EXECUTE_FUNCTION',
      function: functionName,
      arguments: args
    };

    const response = await browser.tabs.sendMessage(activeTab.id, message) as ContentScriptFunctionResponse;
    
    if (!response.success) {
      throw new Error(response.error || `Failed to execute ${functionName}`);
    }
    
    return response;
  } catch (error) {
    console.error(`Error executing content script function ${functionName}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Screenshot Tool
 * Captures a screenshot of the current page or viewport
 */
export const screenshotTool = tool({
  description: 'Capture a screenshot of the current page. Use this to see what the user is looking at or to analyze visual content.',
  inputSchema: z.object({
    fullPage: z.boolean()
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
        quality: 90
      });

      return {
        type: 'screenshot',
        success: true,
        dataUrl,
        timestamp: Date.now(),
        fullPage
      };
    } catch (error) {
      console.error('Screenshot capture error:', error);
      return {
        type: 'screenshot',
        success: false,
        error: error instanceof Error ? error.message : 'Screenshot capture failed'
      };
    }
  }
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
      includeHidden: z.boolean()
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
      includeLinks: z.boolean()
        .optional()
        .default(true)
        .describe('Whether to include link text'),
      includeButtons: z.boolean()
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
    includeMetadata: z.boolean()
      .optional()
      .default(true)
      .describe('Whether to include page metadata (title, URL, description)'),
    includeHeadings: z.boolean()
      .optional()
      .default(true)
      .describe('Whether to include page headings structure'),
    includeInteractiveElements: z.boolean()
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
      scrollIntoView: z.boolean()
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
      clear: z.boolean()
        .optional()
        .default(true)
        .describe('Whether to clear existing content before typing'),
      delay: z.number()
        .optional()
        .default(100)
        .describe('Delay between keystrokes in milliseconds'),
      pressEnter: z.boolean()
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
 * Scroll Tool
 * Scroll the page or specific elements
 */
export const scrollTool = tool({
  description: 'Scroll the page or a specific element. Useful for revealing more content or navigating to specific sections.',
  inputSchema: z.object({
    direction: z.enum(['up', 'down', 'left', 'right', 'top', 'bottom'])
      .describe('Direction to scroll'),
    distance: z.number()
      .optional()
      .describe('Distance to scroll in pixels (for up/down/left/right)'),
    selector: z.string()
      .optional()
      .describe('CSS selector of element to scroll (if not provided, scrolls the page)'),
    smooth: z.boolean()
      .optional()
      .default(true)
      .describe('Whether to use smooth scrolling animation')
  }),
  execute: async ({ direction, distance, selector, smooth = true }) => {
    const result = await executeContentScriptFunction('scroll', { 
      direction,
      distance,
      selector,
      smooth
    });
    
    return result.success ? result.result : { error: result.error };
  }
});

/**
 * Wait Tool
 * Wait for a specified amount of time or for an element to appear
 */
export const waitTool = tool({
  description: 'Wait for a specified time or for an element to appear on the page. Useful when pages need time to load content.',
  inputSchema: z.object({
    type: z.enum(['time', 'element'])
      .describe('Type of wait: time (wait for duration) or element (wait for element to appear)'),
    duration: z.number()
      .optional()
      .describe('Duration in milliseconds (for time wait)'),
    selector: z.string()
      .optional()
      .describe('CSS selector of element to wait for (for element wait)'),
    timeout: z.number()
      .optional()
      .default(10000)
      .describe('Maximum time to wait in milliseconds')
  }),
  execute: async ({ type, duration, selector, timeout = 10000 }) => {
    if (type === 'time' && !duration) {
      return {
        success: false,
        error: 'Duration is required for time wait'
      };
    }
    
    if (type === 'element' && !selector) {
      return {
        success: false,
        error: 'Selector is required for element wait'
      };
    }

    const result = await executeContentScriptFunction('wait', { 
      type,
      duration,
      selector,
      timeout
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
  scroll: scrollTool,
  wait: waitTool,
};

/**
 * Get tools based on configuration
 * Allows enabling/disabling specific tool categories
 */
export function getConfiguredTools(config: {
  enableScreenshot?: boolean;
  enablePageInteraction?: boolean;
  enableTextExtraction?: boolean;
  enableNavigation?: boolean;
} = {}): Record<string, any> {
  const {
    enableScreenshot = true,
    enablePageInteraction = true,
    enableTextExtraction = true,
    enableNavigation = true,
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

  if (enableNavigation) {
    tools.scroll = scrollTool;
    tools.wait = waitTool;
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
  scroll: 'Scroll page or elements',
  wait: 'Wait for time or elements to appear',
};