import browser from "webextension-polyfill";
import { DEFAULT_TRUNCATION_LIMIT } from "~/utils/constants";

export interface LLMHelperInterface {
  find(pattern: string, options?: {
    limit?: number;
    type?: string;
    visible?: boolean;
    offset?: number;
  }): {
    elements: Array<{
      selector: string;
      text: string;
      tag: string;
      classes: string;
    }>;
    total: number;
    hasMore: boolean;
  };
  click(selector: string): string;
  type(selector: string, text: string): string;
  extract(selector?: string, property?: string): string;
  summary(): string;
  describe(selector: string): string;
  screenshot(): Promise<string>;
}

export function createLLMHelper(): LLMHelperInterface {
  // Counter for generating unique selectors when needed
  // let selectorCounter = 0; // Commented out as unused
  
  // Settings cache - will be updated from extension settings
  let debugMode = false;
  let lastKnownDebugMode: boolean | null = null;
  let truncationLimit = DEFAULT_TRUNCATION_LIMIT;
  let lastKnownTruncationLimit: number | null = null;

  // Debug logging helper
  function debugLog(message: string, data?: any) {
    if (debugMode) {
      if (data !== undefined) {
        console.log(`[LLMHelper Debug] ${message}`, data);
      } else {
        console.log(`[LLMHelper Debug] ${message}`);
      }
    }
  }

  // Helper function to generate a unique CSS selector for an element
  function generateSelector(element: Element): string {
    // Try to use existing ID
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }
    
    // Try to use data attributes for uniqueness
    const dataAttrs = Array.from(element.attributes)
      .filter(attr => attr.name.startsWith('data-'))
      .slice(0, 2);
    
    if (dataAttrs.length > 0) {
      const dataSelector = dataAttrs.map(attr => `[${attr.name}="${CSS.escape(attr.value)}"]`).join('');
      const candidates = document.querySelectorAll(`${element.tagName.toLowerCase()}${dataSelector}`);
      if (candidates.length === 1) {
        return `${element.tagName.toLowerCase()}${dataSelector}`;
      }
    }
    
    // Generate nth-child selector as last resort
    let selector = element.tagName.toLowerCase();
    let current = element;
    
    while (current.parentElement) {
      const parent = current.parentElement;
      const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
      
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector = `${current.tagName.toLowerCase()}:nth-of-type(${index}) > ${selector}`;
      } else {
        selector = `${current.tagName.toLowerCase()} > ${selector}`;
      }
      
      current = parent;
      
      // Stop if we have a unique selector or reach the body
      if (parent.tagName === 'BODY' || parent.id) {
        if (parent.id) {
          selector = `#${CSS.escape(parent.id)} > ${selector}`;
        }
        break;
      }
    }
    
    return selector;
  }

  // Helper function to check if element is visible
  function isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      element.getBoundingClientRect().width > 0 &&
      element.getBoundingClientRect().height > 0
    );
  }

  // Helper function to truncate text
  function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
  }

  // Helper function to apply response truncation with message
  function applyResponseTruncation(text: string): string {
    if (text.length <= truncationLimit) {
      return text;
    }
    
    const truncatedText = text.substring(0, truncationLimit);
    const message = `\n\n[Response truncated at ${truncationLimit} characters. Original length was ${text.length} characters.]`;
    return truncatedText + message;
  }

  // Helper function to get text content from element
  function getElementText(element: Element): string {
    if (element instanceof HTMLInputElement) {
      return element.value || element.placeholder || "";
    }
    if (element instanceof HTMLTextAreaElement) {
      return element.value || element.placeholder || "";
    }
    return element.textContent?.trim() || "";
  }

  // Function to get settings from extension
  async function updateSettings() {
    try {
      const settings = await browser.storage.local.get(["settings"]);
      let newDebugMode = false;
      let newTruncationLimit = DEFAULT_TRUNCATION_LIMIT;
      
      if (settings.settings && typeof settings.settings === 'object') {
        if ('debugMode' in settings.settings) {
          newDebugMode = Boolean(settings.settings.debugMode);
        }
        if ('truncationLimit' in settings.settings) {
          newTruncationLimit = Number(settings.settings.truncationLimit) || DEFAULT_TRUNCATION_LIMIT;
        }
      }
      
      // Only log when debug mode actually changes
      if (lastKnownDebugMode !== newDebugMode) {
        console.log(`[LLMHelper] Debug mode changed from "${lastKnownDebugMode}" to "${newDebugMode}"`);
        debugMode = newDebugMode;
        lastKnownDebugMode = newDebugMode;
      } else {
        debugMode = newDebugMode;
      }
      
      // Only log when truncation limit actually changes
      if (lastKnownTruncationLimit !== newTruncationLimit) {
        console.log(`[LLMHelper] Truncation limit changed from ${lastKnownTruncationLimit} to ${newTruncationLimit}`);
        truncationLimit = newTruncationLimit;
        lastKnownTruncationLimit = newTruncationLimit;
      } else {
        truncationLimit = newTruncationLimit;
      }
    } catch (error) {
      console.error("Error getting settings:", error);
    }
  }

  // Initialize settings
  updateSettings();

  // Listen for storage changes to update settings automatically
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.settings) {
      updateSettings();
    }
  });

  // LLMHelper interface for browser automation
  const LLMHelper: LLMHelperInterface = {
    // Find elements matching a pattern with pagination
    find(pattern: string, options: {
      limit?: number;
      type?: string;
      visible?: boolean;
      offset?: number;
    } = {}): {
      elements: Array<{
        selector: string;
        text: string;
        tag: string;
        classes: string;
      }>;
      total: number;
      hasMore: boolean;
    } {
      try {
        debugLog("find() called", { pattern, options });
        
        const regex = new RegExp(pattern, "i");
        const selectorQuery = options.type === "*" ? "*" : 
                             options.type || "button, a, input, textarea, select, [role='button']";
        
        const candidates = document.querySelectorAll(selectorQuery);
        debugLog(`Found ${candidates.length} candidate elements for selector: ${selectorQuery}`);
        
        const matchingElements = Array.from(candidates)
          .filter((el) => {
            const text = getElementText(el);
            const matchesPattern = regex.test(text);
            const isVisibleElement = !options.visible || isVisible(el);
            return matchesPattern && isVisibleElement;
          });
        
        const total = matchingElements.length;
        const limit = options.limit || 10;
        const offset = options.offset || 0;
        
        const paginatedElements = matchingElements
          .slice(offset, offset + limit)
          .map((el) => ({
            selector: generateSelector(el),
            text: truncate(getElementText(el), 50),
            tag: el.tagName.toLowerCase(),
            classes: el.className
              ? el.className.split(" ").slice(0, 3).join(" ")
              : "",
          }));
        
        const result = {
          elements: paginatedElements,
          total,
          hasMore: offset + limit < total
        };
        
        debugLog(`find() returning ${paginatedElements.length} of ${total} total elements`, result);
        return result;
      } catch (error) {
        console.error("LLMHelper.find error:", error);
        return { elements: [], total: 0, hasMore: false };
      }
    },

    // Click on an element
    click(selector: string): string {
      try {
        debugLog("click() called", { selector });
        
        const element = document.querySelector(selector);
        if (!element) {
          return `No element found matching selector: ${selector}`;
        }
        
        // Ensure element is focusable if it's an input
        if (element instanceof HTMLElement) {
          element.focus();
        }
        
        // Use MouseEvent for reliable cross-site compatibility
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        
        element.dispatchEvent(clickEvent);
        
        const elementInfo = `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className ? '.' + element.className.split(' ').slice(0, 2).join('.') : ''}`;
        const result = `Clicked ${elementInfo}`;
        debugLog("click() result", result);
        return result;
      } catch (error) {
        console.error("LLMHelper.click error:", error);
        return `Error clicking element: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },

    // Type text into an element
    type(selector: string, text: string): string {
      try {
        debugLog("type() called", { selector, text });
        
        const element = document.querySelector(selector);
        if (!element) {
          return `No element found matching selector: ${selector}`;
        }
        
        // Focus the element
        if (element instanceof HTMLElement) {
          element.focus();
        }
        
        // Handle different input types
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          // Clear existing content and set new value
          element.value = text;
          
          // Dispatch input and change events for React/Vue compatibility
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));
        } else if ((element as HTMLElement).contentEditable === 'true') {
          // Handle contenteditable elements
          element.textContent = text;
          
          // Dispatch input event for contenteditable
          element.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          return `Element is not typeable: ${element.tagName.toLowerCase()}`;
        }
        
        const elementInfo = `${element.tagName.toLowerCase()}${element.id ? '#' + element.id : ''}${element.className ? '.' + element.className.split(' ').slice(0, 2).join('.') : ''}`;
        const result = `Typed "${text}" into ${elementInfo}`;
        debugLog("type() result", result);
        return result;
      } catch (error) {
        console.error("LLMHelper.type error:", error);
        return `Error typing into element: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },

    // Extract text from the page or specific element
    extract(selector?: string, property?: string): string {
      try {
        debugLog("extract() called", { selector, property });
        if (selector) {
          const element = document.querySelector(selector);
          if (!element) {
            return "Element not found";
          }
          
          if (property) {
            if (property === "innerText") {
              return element.textContent?.trim() || "";
            }
            if (property === "value" && element instanceof HTMLInputElement) {
              return element.value;
            }
            if (property.startsWith("data-")) {
              return element.getAttribute(property) || "";
            }
            if (property === "href" && element instanceof HTMLAnchorElement) {
              return element.href;
            }
            return element.getAttribute(property) || "";
          }
          
          return getElementText(element);
        }
        
        // Extract all visible text from the page
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              
              // Skip script, style, and hidden elements
              if (
                parent.tagName === "SCRIPT" ||
                parent.tagName === "STYLE" ||
                !isVisible(parent)
              ) {
                return NodeFilter.FILTER_REJECT;
              }
              
              // Only include text nodes with meaningful content
              const text = node.textContent?.trim();
              return text && text.length > 2
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_REJECT;
            },
          }
        );

        const textNodes: string[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim();
          if (text) {
            textNodes.push(text);
          }
        }

        const fullText = textNodes.join("<br>");
        const result = applyResponseTruncation(fullText);
        debugLog(`extract() returning text (${result.length} chars, original: ${fullText.length} chars)`);
        return result;
      } catch (error) {
        console.error("LLMHelper.extract error:", error);
        return "Error extracting text";
      }
    },

    // Get a summary of the page
    summary(): string {
      try {
        debugLog("summary() called");
        const title = document.title;
        const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
          .map((h) => h.textContent?.trim())
          .filter(Boolean)
          .slice(0, 5);
        
        const buttons = document.querySelectorAll("button, [role='button']").length;
        const links = document.querySelectorAll("a[href]").length;
        const inputs = document.querySelectorAll("input, textarea, select").length;
        const tables = document.querySelectorAll("table").length;
        const forms = document.querySelectorAll("form").length;

        let summary = `Page: ${title}`;
        
        if (headings.length > 0) {
          summary += `. Sections: ${headings.join(", ")}`;
        }
        
        summary += `. Interactive elements: ${buttons} buttons, ${links} links`;
        
        if (inputs > 0) {
          summary += `, ${inputs} form fields`;
        }
        
        if (forms > 0) {
          summary += `, ${forms} forms`;
        }
        
        if (tables > 0) {
          summary += `, ${tables} tables`;
        }

        debugLog("summary() result", summary);
        return summary;
      } catch (error) {
        console.error("LLMHelper.summary error:", error);
        return "Error generating page summary";
      }
    },

    // Take a screenshot of the current tab
    async screenshot(): Promise<string> {
      try {
        debugLog("screenshot() called");
        
        // Send message to background script to capture screenshot
        if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
          const response = await browser.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
          
          if (response && (response as any).success) {
            debugLog("screenshot() successful", (response as any).dataUrl?.substring(0, 50) + '...');
            return (response as any).dataUrl;
          } else {
            throw new Error((response as any)?.error || 'Screenshot failed - no response');
          }
        } else {
          throw new Error('Browser runtime not available');
        }
      } catch (error) {
        console.error("LLMHelper.screenshot error:", error);
        throw new Error(`Screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    },

    // Describe a specific section of the page
    describe(selector: string): string {
      try {
        const element = document.querySelector(selector);
        if (!element) {
          return `No element found matching selector: ${selector}`;
        }

        const tag = element.tagName.toLowerCase();
        const text = getElementText(element).substring(0, 100);
        const children = element.children.length;
        const childTags = Array.from(element.children)
          .map((child) => child.tagName.toLowerCase())
          .reduce((acc, tag) => {
            acc[tag] = (acc[tag] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

        let description = `${tag} element`;
        
        if (text) {
          description += ` with text: "${text}"`;
        }
        
        if (children > 0) {
          description += `. Contains ${children} child elements`;
          const childSummary = Object.entries(childTags)
            .map(([tag, count]) => `${count} ${tag}${count > 1 ? "s" : ""}`)
            .join(", ");
          description += `: ${childSummary}`;
        }

        return description;
      } catch (error) {
        console.error("LLMHelper.describe error:", error);
        return "Error describing element";
      }
    },
  };

  return LLMHelper;
}