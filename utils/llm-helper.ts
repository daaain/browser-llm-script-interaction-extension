import browser from "webextension-polyfill";
import { DEFAULT_TRUNCATION_LIMIT } from "~/utils/constants";

export interface LLMHelperInterface {
  find(pattern: string, options?: {
    limit?: number;
    type?: string;
    visible?: boolean;
  }): Array<{
    id: number;
    text: string;
    tag: string;
    classes: string;
  }>;
  extract(elementId?: number, property?: string): string;
  summary(): string;
  clear(): string;
  describe(selector: string): string;
}

export function createLLMHelper(): LLMHelperInterface {
  // Element storage for maintaining references
  const elementStore = new Map<number, Element>();
  let nextId = 1;
  
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

  // Helper function to store an element and return its ID
  function storeElement(element: Element): number {
    const id = nextId++;
    elementStore.set(id, element);
    // Auto-cleanup after 5 minutes to prevent memory leaks
    setTimeout(() => elementStore.delete(id), 5 * 60 * 1000);
    return id;
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
    // Find elements matching a pattern
    find(pattern: string, options: {
      limit?: number;
      type?: string;
      visible?: boolean;
    } = {}): Array<{
      id: number;
      text: string;
      tag: string;
      classes: string;
    }> {
      try {
        debugLog("find() called", { pattern, options });
        
        const regex = new RegExp(pattern, "i");
        const selector = options.type === "*" ? "*" : 
                        options.type || "button, a, input, textarea, select, [role='button']";
        
        const candidates = document.querySelectorAll(selector);
        debugLog(`Found ${candidates.length} candidate elements for selector: ${selector}`);
        
        const results = Array.from(candidates)
          .filter((el) => {
            const text = getElementText(el);
            const matchesPattern = regex.test(text);
            const isVisibleElement = !options.visible || isVisible(el);
            return matchesPattern && isVisibleElement;
          })
          .slice(0, options.limit || 10)
          .map((el) => ({
            id: storeElement(el),
            text: truncate(getElementText(el), 50),
            tag: el.tagName.toLowerCase(),
            classes: el.className
              ? el.className.split(" ").slice(0, 3).join(" ")
              : "",
          }));
        
        debugLog(`find() returning ${results.length} elements`, results);
        return results;
      } catch (error) {
        console.error("LLMHelper.find error:", error);
        return [];
      }
    },

    // Extract text from the page or specific element
    extract(elementId?: number, property?: string): string {
      try {
        debugLog("extract() called", { elementId, property });
        if (elementId) {
          const element = elementStore.get(elementId);
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

    // Clear stored element references
    clear(): string {
      elementStore.clear();
      nextId = 1;
      return "Element references cleared";
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