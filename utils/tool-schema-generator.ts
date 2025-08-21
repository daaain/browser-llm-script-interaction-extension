import type { LLMTool } from "~/utils/types";
import type { LLMHelperInterface } from "~/utils/llm-helper";

/**
 * Generates OpenAI-compatible tool definitions for LLMHelper methods
 */
export function generateLLMHelperTools(): LLMTool[] {
  return [
    {
      type: "function",
      function: {
        name: "find",
        description: "Find DOM elements on the current web page that match a text pattern. Returns element IDs that can be used with other methods.",
        parameters: {
          type: "object",
          properties: {
            pattern: {
              type: "string",
              description: "Regular expression pattern to search for in element text content"
            },
            options: {
              type: "object",
              description: "Optional search parameters",
              properties: {
                limit: {
                  type: "number", 
                  description: "Maximum number of results to return (default: 10)"
                },
                type: {
                  type: "string",
                  description: "CSS selector to limit element types (default: 'button, a, input, textarea, select, [role=button]'). Use '*' for all elements."
                },
                visible: {
                  type: "boolean",
                  description: "Whether to only return visible elements (default: false)"
                }
              }
            }
          },
          required: ["pattern"]
        }
      }
    },
    {
      type: "function", 
      function: {
        name: "extract",
        description: "Extract text content from a specific element by ID, or extract all visible text from the entire page if no ID provided.",
        parameters: {
          type: "object",
          properties: {
            elementId: {
              type: "number",
              description: "Optional element ID obtained from find() method. If omitted, extracts all visible page text."
            },
            property: {
              type: "string", 
              description: "Optional property to extract (e.g., 'innerText', 'value', 'href', or any HTML attribute)"
            }
          }
        }
      }
    },
    {
      type: "function",
      function: {
        name: "summary", 
        description: "Get a structural summary of the current web page including title, headings, and counts of interactive elements.",
        parameters: {
          type: "object",
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "clear",
        description: "Clear all stored element references to free memory. Use this periodically during long sessions.",
        parameters: {
          type: "object", 
          properties: {}
        }
      }
    },
    {
      type: "function",
      function: {
        name: "describe",
        description: "Get a detailed description of a specific page section using a CSS selector.",
        parameters: {
          type: "object",
          properties: {
            selector: {
              type: "string",
              description: "CSS selector for the element to describe (e.g., 'nav', '.header', '#main-content')"
            }
          },
          required: ["selector"]
        }
      }
    }
  ];
}

/**
 * Validates if a function name corresponds to an LLMHelper method
 */
export function isValidLLMHelperMethod(functionName: string): functionName is keyof LLMHelperInterface {
  const validMethods = ['find', 'extract', 'summary', 'clear', 'describe'] as const;
  return validMethods.includes(functionName as any);
}

/**
 * Parses and validates tool call arguments for LLMHelper methods
 */
export function parseToolCallArguments(functionName: string, argumentsString: string): any {
  try {
    const args = JSON.parse(argumentsString);
    
    // Validate arguments based on function
    switch (functionName) {
      case 'find':
        if (typeof args.pattern !== 'string') {
          throw new Error('find() requires a string pattern argument');
        }
        break;
      case 'extract':
        if (args.elementId !== undefined && typeof args.elementId !== 'number') {
          throw new Error('extract() elementId must be a number');
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
      case 'clear':
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