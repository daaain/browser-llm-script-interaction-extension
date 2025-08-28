import type { LLMHelperInterface } from '~/utils/llm-helper';
import type { LLMTool } from '~/utils/types';

/**
 * Generates OpenAI-compatible tool definitions for LLMHelper methods
 */
export function generateLLMHelperTools(): LLMTool[] {
  return [
    {
      type: 'function',
      function: {
        name: 'find',
        description:
          'Find DOM elements on the current web page that match a text pattern. Returns CSS selectors and pagination info. Use offset to get more results.',
        parameters: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              description: 'Regular expression pattern to search for in element text content',
            },
            options: {
              type: 'object',
              description: 'Optional search parameters',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of results to return (default: 10)',
                },
                offset: {
                  type: 'number',
                  description: 'Number of results to skip for pagination (default: 0)',
                },
                type: {
                  type: 'string',
                  description:
                    "CSS selector to limit element types (default: 'button, a, input, textarea, select, [role=button]'). Use '*' for all elements.",
                },
                visible: {
                  type: 'boolean',
                  description: 'Whether to only return visible elements (default: false)',
                },
              },
            },
          },
          required: ['pattern'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'click',
        description:
          'Click on a DOM element using its CSS selector. Dispatches a MouseEvent for reliable cross-site compatibility.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the element to click (obtained from find() method)',
            },
          },
          required: ['selector'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'type',
        description:
          'Type text into an input element, textarea, or contenteditable element. Triggers input and change events for framework compatibility.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector for the input element (obtained from find() method)',
            },
            text: {
              type: 'string',
              description: 'Text to type into the element',
            },
          },
          required: ['selector', 'text'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'extract',
        description:
          'Extract text content from a specific element by CSS selector, or extract all visible text from the entire page if no selector provided.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'Optional CSS selector for the element to extract from. If omitted, extracts all visible page text.',
            },
            property: {
              type: 'string',
              description:
                "Optional property to extract (e.g., 'innerText', 'value', 'href', or any HTML attribute)",
            },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'summary',
        description:
          'Get a structural summary of the current web page including title, headings, and counts of interactive elements.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'screenshot',
        description:
          'Capture a screenshot of the current visible tab area. Returns a base64-encoded data URL that can be displayed or analyzed.',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'describe',
        description: 'Get a detailed description of a specific page section using a CSS selector.',
        parameters: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                "CSS selector for the element to describe (e.g., 'nav', '.header', '#main-content')",
            },
          },
          required: ['selector'],
        },
      },
    },
  ];
}

/**
 * Validates if a function name corresponds to an LLMHelper method
 */
export function isValidLLMHelperMethod(
  functionName: string,
): functionName is keyof LLMHelperInterface {
  const validMethods = [
    'find',
    'click',
    'type',
    'extract',
    'summary',
    'describe',
    'screenshot',
  ] as const;
  return validMethods.includes(functionName as (typeof validMethods)[number]);
}

/**
 * Parses and validates tool call arguments for LLMHelper methods
 */
export function parseToolCallArguments(
  functionName: string,
  argumentsString: string,
): Record<string, unknown> {
  try {
    const args = JSON.parse(argumentsString);

    // Validate arguments based on function
    switch (functionName) {
      case 'find':
        if (typeof args.pattern !== 'string') {
          throw new Error('find() requires a string pattern argument');
        }
        break;
      case 'click':
        if (typeof args.selector !== 'string') {
          throw new Error('click() requires a string selector argument');
        }
        break;
      case 'type':
        if (typeof args.selector !== 'string') {
          throw new Error('type() requires a string selector argument');
        }
        if (typeof args.text !== 'string') {
          throw new Error('type() requires a string text argument');
        }
        break;
      case 'extract':
        if (args.selector !== undefined && typeof args.selector !== 'string') {
          throw new Error('extract() selector must be a string');
        }
        if (args.property !== undefined && typeof args.property !== 'string') {
          throw new Error('extract() property must be a string');
        }
        break;
      case 'describe':
        if (typeof args.selector !== 'string') {
          throw new Error('describe() requires a string selector argument');
        }
        break;
      case 'summary':
      case 'screenshot':
        // These methods don't require arguments
        break;
      default:
        throw new Error(`Unknown LLMHelper method: ${functionName}`);
    }

    return args;
  } catch (error) {
    if (error instanceof Error && error.message.includes('JSON')) {
      throw new Error(`Invalid JSON in tool call arguments: ${error.message}`);
    }
    throw error;
  }
}
