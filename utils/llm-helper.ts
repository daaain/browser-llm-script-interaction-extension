import browser from 'webextension-polyfill';
import { contentLogger } from './debug-logger';

export interface LLMHelperInterface {
  find(
    pattern: string,
    options?: {
      limit?: number;
      type?: string;
      visible?: boolean;
      offset?: number;
    },
  ): {
    elements: Array<{
      selector: string;
      text: string;
      tag: string;
      classes: string;
    }>;
    total: number;
    hasMore: boolean;
  };
  click(
    selector?: string,
    text?: string,
  ): string | { elements: any[]; total: number; searchText: string; action: string };
  type(
    selector: string,
    text: string,
    options?: {
      clear?: boolean;
      delay?: number;
      pressEnter?: boolean;
    },
  ): string;
  extract(selector?: string, property?: string): string;
  summary(): string;
  describe(selector: string): string;
  screenshot(): Promise<string>;
  getResponsePage(responseId: string, page: number): Promise<any>;
}

export function createLLMHelper(): LLMHelperInterface {
  // Counter for generating unique selectors when needed
  // let selectorCounter = 0; // Commented out as unused

  // Settings cache - will be updated from extension settings
  let debugMode = false;
  let lastKnownDebugMode: boolean | null = null;

  // Debug logging helper - now uses persistent storage
  function debugLog(message: string, data?: any) {
    if (debugMode) {
      contentLogger.debug(`[LLMHelper] ${message}`, data);
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
      .filter((attr) => attr.name.startsWith('data-'))
      .slice(0, 2);

    if (dataAttrs.length > 0) {
      const dataSelector = dataAttrs
        .map((attr) => `[${attr.name}="${CSS.escape(attr.value)}"]`)
        .join('');
      const candidates = document.querySelectorAll(
        `${element.tagName.toLowerCase()}${dataSelector}`,
      );
      if (candidates.length === 1) {
        return `${element.tagName.toLowerCase()}${dataSelector}`;
      }
    }

    // Generate nth-child selector as last resort
    let selector = element.tagName.toLowerCase();
    let current = element;

    while (current.parentElement) {
      const parent = current.parentElement;
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName,
      );

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
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      element.getBoundingClientRect().width > 0 &&
      element.getBoundingClientRect().height > 0
    );
  }

  // Helper function to truncate text
  function truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
  }

  // Helper function to score elements based on where the pattern matches
  function scoreElement(element: Element, pattern: RegExp): number {
    let score = 0;

    // Highest priority: matches in visible text content
    const textContent = getElementText(element);
    if (pattern.test(textContent)) {
      score += 100;
    }

    // High priority: matches in form values or placeholders
    if (element instanceof HTMLInputElement) {
      if (pattern.test(element.value || '')) score += 90;
      if (pattern.test(element.placeholder || '')) score += 80;
    }

    // Medium priority: matches in accessibility attributes
    const ariaLabel = element.getAttribute('aria-label') || '';
    const title = element.getAttribute('title') || '';
    const alt = element.getAttribute('alt') || '';

    if (pattern.test(ariaLabel)) score += 70;
    if (pattern.test(title)) score += 60;
    if (pattern.test(alt)) score += 60;

    return score;
  }

  // Helper function to remove duplicate nested elements
  function deduplicateElements(elements: Element[]): Element[] {
    const result: Element[] = [];

    for (const element of elements) {
      let shouldInclude = true;

      // Check if this element is contained within any element already in results
      for (const existing of result) {
        if (existing.contains(element)) {
          shouldInclude = false;
          break;
        }
        // If current element contains an existing element, remove the existing one
        if (element.contains(existing)) {
          const index = result.indexOf(existing);
          result.splice(index, 1);
        }
      }

      if (shouldInclude) {
        result.push(element);
      }
    }

    return result;
  }

  // Note: Response truncation is now handled globally by the response manager

  // Helper function to get text content from element
  function getElementText(element: Element): string {
    if (element instanceof HTMLInputElement) {
      return element.value || element.placeholder || '';
    }
    if (element instanceof HTMLTextAreaElement) {
      return element.value || element.placeholder || '';
    }
    if (element instanceof HTMLElement) {
      return element.innerText || '';
    }
    return element.textContent?.trim() || '';
  }

  // Function to get settings from extension
  async function updateSettings() {
    try {
      const settings = await browser.storage.local.get(['settings']);
      let newDebugMode = false;

      if (settings.settings && typeof settings.settings === 'object') {
        if ('debugMode' in settings.settings) {
          newDebugMode = Boolean(settings.settings.debugMode);
        }
      }

      // Only log when debug mode actually changes
      if (lastKnownDebugMode !== newDebugMode) {
        contentLogger.info(`Debug mode changed from "${lastKnownDebugMode}" to "${newDebugMode}"`);
        debugMode = newDebugMode;
        lastKnownDebugMode = newDebugMode;
      } else {
        debugMode = newDebugMode;
      }
    } catch (error) {
      contentLogger.error('Error getting settings:', error);
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
    find(
      pattern: string,
      options: {
        limit?: number;
        type?: string;
        visible?: boolean;
        offset?: number;
      } = {},
    ): {
      elements: Array<{
        selector: string;
        text: string;
        tag: string;
        classes: string;
      }>;
      total: number;
      hasMore: boolean;
    } {
      const operationId = `find-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        contentLogger.info('Tool execution: find started', {
          operationId,
          pattern,
          options,
        });

        const regex = new RegExp(pattern, 'i');
        const selectorQuery =
          options.type === '*'
            ? '*'
            : options.type || "button, a, input, textarea, select, [role='button']";

        const candidates = document.querySelectorAll(selectorQuery);
        debugLog(`Found ${candidates.length} candidate elements for selector: ${selectorQuery}`);

        // Score and filter elements
        const scoredElements = Array.from(candidates)
          .map((el) => ({
            element: el,
            score: scoreElement(el, regex),
          }))
          .filter(({ score, element }) => {
            const isVisibleElement = !options.visible || isVisible(element);
            return score > 0 && isVisibleElement;
          })
          .sort((a, b) => b.score - a.score); // Sort by score descending

        // Deduplicate nested elements and get final list
        const preliminaryElements = scoredElements.map(({ element }) => element);
        const matchingElements = deduplicateElements(preliminaryElements);

        const total = matchingElements.length;
        const limit = options.limit || 10;
        const offset = options.offset || 0;

        const paginatedElements = matchingElements.slice(offset, offset + limit).map((el) => ({
          selector: generateSelector(el),
          text: truncate(getElementText(el), 50),
          tag: el.tagName.toLowerCase(),
          classes: el.className ? el.className.split(' ').slice(0, 3).join(' ') : '',
        }));

        const result = {
          elements: paginatedElements,
          total,
          hasMore: offset + limit < total,
        };

        const duration = Date.now() - startTime;
        contentLogger.info('Tool execution: find completed', {
          operationId,
          duration,
          elementsFound: total,
          elementsReturned: paginatedElements.length,
          hasMore: offset + limit < total,
          result,
        });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        contentLogger.error('Tool execution: find failed', {
          operationId,
          duration,
          pattern,
          options,
          error: error instanceof Error ? error.message : error,
        });
        return { elements: [], total: 0, hasMore: false };
      }
    },

    // Click on an element
    click(
      selector?: string,
      text?: string,
    ): string | { elements: any[]; total: number; searchText: string; action: string } {
      const operationId = `click-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        contentLogger.info('Tool execution: click started', {
          operationId,
          selector,
          text,
        });

        let element: Element | null = null;

        // If both selector and text are provided, prefer selector
        if (selector) {
          element = document.querySelector(selector);
          if (!element) {
            return `No element found matching selector: ${selector}`;
          }
        } else if (text) {
          // Use find() internally to search by text
          const findResult = this.find(text, {
            limit: 5,
            type: '*',
            visible: true,
          });

          if (findResult.elements.length === 0) {
            return `No element found containing text: "${text}"`;
          }

          if (findResult.elements.length > 1) {
            // Return structured response similar to find() for LLM to choose from
            return {
              elements: findResult.elements,
              total: findResult.total,
              searchText: text!,
              action: 'click',
            };
          }

          // Get the element using the selector from find result
          element = document.querySelector(findResult.elements[0].selector);
          if (!element) {
            return `Found element but could not select it: ${findResult.elements[0].selector}`;
          }
        } else {
          return `Either selector or text must be provided`;
        }

        // Ensure element is focusable if it's an input
        if (element instanceof HTMLElement) {
          element.focus();
        }

        // Use MouseEvent for reliable cross-site compatibility
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        });

        element.dispatchEvent(clickEvent);

        const elementInfo = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${element.className.split(' ').slice(0, 2).join('.')}` : ''}`;
        const result = `Clicked ${elementInfo}`;
        const duration = Date.now() - startTime;

        contentLogger.info('Tool execution: click completed', {
          operationId,
          duration,
          elementInfo,
          clickedElement: {
            tagName: element.tagName,
            id: element.id || null,
            className: element.className || null,
          },
          result,
        });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        contentLogger.error('Tool execution: click failed', {
          operationId,
          duration,
          selector,
          text,
          error: error instanceof Error ? error.message : error,
        });
        return `Error clicking element: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },

    // Type text into an element
    type(
      selector: string,
      text: string,
      options?: {
        clear?: boolean;
        delay?: number;
        pressEnter?: boolean;
      },
    ): string {
      const operationId = `type-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        contentLogger.info('Tool execution: type started', {
          operationId,
          selector,
          text,
          options,
        });

        const element = document.querySelector(selector);
        if (!element) {
          return `No element found matching selector: ${selector}`;
        }

        // Check if element is a button and reject
        if (
          element instanceof HTMLButtonElement ||
          (element instanceof HTMLInputElement &&
            (element.type === 'submit' || element.type === 'button')) ||
          element.getAttribute('role') === 'button'
        ) {
          return `Cannot type into button element: ${element.tagName.toLowerCase()}`;
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

          // Press Enter if requested
          if (options?.pressEnter) {
            element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
          }
        } else if ((element as HTMLElement).contentEditable === 'true') {
          // Handle contenteditable elements
          element.textContent = text;

          // Dispatch input event for contenteditable
          element.dispatchEvent(new Event('input', { bubbles: true }));

          // Press Enter if requested
          if (options?.pressEnter) {
            element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true }));
            element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
          }
        } else {
          return `Element is not typeable: ${element.tagName.toLowerCase()}`;
        }

        const elementInfo = `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${element.className ? `.${element.className.split(' ').slice(0, 2).join('.')}` : ''}`;
        const enterInfo = options?.pressEnter ? ' and pressed Enter' : '';
        const result = `Typed "${text}" into ${elementInfo}${enterInfo}`;
        const duration = Date.now() - startTime;

        contentLogger.info('Tool execution: type completed', {
          operationId,
          duration,
          elementInfo,
          textLength: text.length,
          pressedEnter: options?.pressEnter || false,
          cleared: options?.clear || false,
          targetElement: {
            tagName: element.tagName,
            id: element.id || null,
            className: element.className || null,
          },
          result,
        });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        contentLogger.error('Tool execution: type failed', {
          operationId,
          duration,
          selector,
          text: text.length > 100 ? `${text.substring(0, 100)}...` : text,
          options,
          error: error instanceof Error ? error.message : error,
        });
        return `Error typing into element: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    },

    // Extract text from the page or specific element
    extract(selector?: string, property?: string): string {
      const operationId = `extract-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        contentLogger.info('Tool execution: extract started', {
          operationId,
          selector,
          property,
        });
        if (selector) {
          const element = document.querySelector(selector);
          if (!element) {
            return 'Element not found';
          }

          if (property) {
            if (property === 'innerText') {
              return element.textContent?.trim() || '';
            }
            if (property === 'value' && element instanceof HTMLInputElement) {
              return element.value;
            }
            if (property.startsWith('data-')) {
              return element.getAttribute(property) || '';
            }
            if (property === 'href' && element instanceof HTMLAnchorElement) {
              return element.href;
            }
            return element.getAttribute(property) || '';
          }

          return getElementText(element);
        }

        // Extract all visible text from the page
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
          acceptNode: (node) => {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;

            // Skip script, style, and hidden elements
            if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE' || !isVisible(parent)) {
              return NodeFilter.FILTER_REJECT;
            }

            // Only include text nodes with meaningful content
            const text = node.textContent?.trim();
            return text && text.length > 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          },
        });

        const textNodes: string[] = [];
        let node: Node | null;
        // biome-ignore lint/suspicious/noAssignInExpressions: this is a simple loop
        while ((node = walker.nextNode())) {
          const text = node.textContent?.trim();
          if (text) {
            textNodes.push(text);
          }
        }

        const fullText = textNodes.join('<br>');
        const duration = Date.now() - startTime;

        contentLogger.info('Tool execution: extract completed', {
          operationId,
          duration,
          textLength: fullText.length,
          nodeCount: textNodes.length,
          selector,
          property,
        });
        return fullText;
      } catch (error) {
        const duration = Date.now() - startTime;
        contentLogger.error('Tool execution: extract failed', {
          operationId,
          duration,
          selector,
          property,
          error: error instanceof Error ? error.message : error,
        });
        return 'Error extracting text';
      }
    },

    // Get a summary of the page
    summary(): string {
      const operationId = `summary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        contentLogger.info('Tool execution: summary started', { operationId });
        const title = document.title;
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
          .map((h) => h.textContent?.trim())
          .filter(Boolean)
          .slice(0, 5);

        const buttons = document.querySelectorAll("button, [role='button']").length;
        const links = document.querySelectorAll('a[href]').length;
        const inputs = document.querySelectorAll('input, textarea, select').length;
        const tables = document.querySelectorAll('table').length;
        const forms = document.querySelectorAll('form').length;

        let summary = `Page: ${title}`;

        if (headings.length > 0) {
          summary += `. Sections: ${headings.join(', ')}`;
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

        const duration = Date.now() - startTime;

        contentLogger.info('Tool execution: summary completed', {
          operationId,
          duration,
          pageTitle: title,
          headingCount: headings.length,
          linkCount: Array.from(document.querySelectorAll('a')).length,
          formCount: Array.from(document.querySelectorAll('form')).length,
          result: summary,
        });
        return summary;
      } catch (error) {
        const duration = Date.now() - startTime;
        contentLogger.error('Tool execution: summary failed', {
          operationId,
          duration,
          error: error instanceof Error ? error.message : error,
        });
        return 'Error generating page summary';
      }
    },

    // Take a screenshot of the current tab
    async screenshot(): Promise<string> {
      const operationId = `screenshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        contentLogger.info('Tool execution: screenshot started', { operationId });

        // Send message to background script to capture screenshot
        if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
          const response = await browser.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });

          if (response && (response as any).success) {
            const duration = Date.now() - startTime;
            const dataUrl = (response as any).dataUrl;

            contentLogger.info('Tool execution: screenshot completed', {
              operationId,
              duration,
              dataUrlLength: dataUrl?.length || 0,
              success: true,
            });
            return dataUrl;
          } else {
            throw new Error((response as any)?.error || 'Screenshot failed - no response');
          }
        } else {
          throw new Error('Browser runtime not available');
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        contentLogger.error('Tool execution: screenshot failed', {
          operationId,
          duration,
          error: error instanceof Error ? error.message : error,
        });
        throw new Error(
          `Screenshot failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },

    // Describe a specific section of the page
    describe(selector: string): string {
      const operationId = `describe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        contentLogger.info('Tool execution: describe started', {
          operationId,
          selector,
        });
        const element = document.querySelector(selector);
        if (!element) {
          return `No element found matching selector: ${selector}`;
        }

        const tag = element.tagName.toLowerCase();
        const text = getElementText(element).substring(0, 100);
        const children = element.children.length;
        const childTags = Array.from(element.children)
          .map((child) => child.tagName.toLowerCase())
          .reduce(
            (acc, tag) => {
              acc[tag] = (acc[tag] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>,
          );

        let description = `${tag} element`;

        if (text) {
          description += ` with text: "${text}"`;
        }

        if (children > 0) {
          description += `. Contains ${children} child elements`;
          const childSummary = Object.entries(childTags)
            .map(([tag, count]) => `${count} ${tag}${count > 1 ? 's' : ''}`)
            .join(', ');
          description += `: ${childSummary}`;
        }

        const duration = Date.now() - startTime;

        contentLogger.info('Tool execution: describe completed', {
          operationId,
          duration,
          selector,
          elementTag: element.tagName,
          textLength: text.length,
          childrenCount: children,
          result: description,
        });
        return description;
      } catch (error) {
        const duration = Date.now() - startTime;
        contentLogger.error('Tool execution: describe failed', {
          operationId,
          duration,
          selector,
          error: error instanceof Error ? error.message : error,
        });
        return 'Error describing element';
      }
    },

    // Get a page from a paginated response
    async getResponsePage(responseId: string, page: number): Promise<any> {
      const operationId = `getResponsePage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      try {
        contentLogger.info('Tool execution: getResponsePage started', {
          operationId,
          responseId,
          page,
        });

        // Send message to background script to get the page
        if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.sendMessage) {
          const message = {
            type: 'GET_RESPONSE_PAGE',
            payload: { responseId, page },
          };

          const response = (await browser.runtime.sendMessage(message)) as any;

          if (response && response.type === 'RESPONSE_PAGE' && response.payload?.success) {
            const duration = Date.now() - startTime;

            contentLogger.info('Tool execution: getResponsePage completed', {
              operationId,
              duration,
              responseId,
              page,
              resultLength: response.payload.result?.length || 0,
              hasResult: !!response.payload.result,
              metadata: response.payload._meta,
            });
            return {
              result: response.payload.result,
              _meta: response.payload._meta,
            };
          } else {
            const error = response?.payload?.error || 'Unknown error';
            throw new Error(`Failed to retrieve page: ${error}`);
          }
        } else {
          throw new Error('Browser runtime not available');
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        contentLogger.error('Tool execution: getResponsePage failed', {
          operationId,
          duration,
          responseId,
          page,
          error: error instanceof Error ? error.message : error,
        });
        throw new Error(
          `Get response page failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    },
  };

  return LLMHelper;
}
