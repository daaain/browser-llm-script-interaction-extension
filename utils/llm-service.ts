// Import types for AI SDK integration
import { openai } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { convertToModelMessages, stepCountIs, streamText } from 'ai';
import { availableTools } from './ai-tools';
import { backgroundLogger } from './debug-logger';
import type { LLMProvider } from './types';

/**
 * LLM Service
 *
 * This provides LLM integration with streaming and tool calling capabilities.
 */

export class LLMService {
  private model: any;

  constructor(config: LLMProvider) {
    this.updateProvider(config);
  }

  updateProvider(config: LLMProvider) {
    if (config.endpoint.includes('api.openai.com')) {
      this.model = openai(config.model);
    } else {
      // Custom provider (LM Studio, etc.)
      const normalizedEndpoint = this.normalizeEndpoint(config.endpoint);

      const customProvider = createOpenAICompatible({
        name: 'lmstudio',
        baseURL: normalizedEndpoint,
        apiKey: config.apiKey || 'not-needed',
      });
      this.model = customProvider(config.model);
    }
  }

  /**
   * Convert ChatMessage[] to proper UI message format that convertToModelMessages expects
   */
  private convertToUIMessages(messages: any[]): Array<Omit<any, 'id'>> {
    return messages.map((msg) => {
      if (msg.role === 'tool') {
        // Tool results are handled differently in the AI SDK
        return {
          role: 'tool' as const,
          parts: [
            {
              type: 'tool-result' as const,
              toolCallId: msg.tool_call_id,
              toolName: 'unknown',
              output: msg.content,
              state: 'output-available' as const,
            },
          ],
        };
      }

      // Check if message already has parts (modern format from storage)
      if (msg.parts && Array.isArray(msg.parts)) {
        return {
          role: msg.role as 'user' | 'assistant' | 'system',
          parts: msg.parts,
        };
      }

      if (msg.role === 'assistant' && msg.tool_calls) {
        // Legacy assistant message with tool calls - convert to modern format
        const parts: Array<any> = [];

        // Add text content if present
        if (msg.content && msg.content.trim()) {
          parts.push({
            type: 'text' as const,
            text: msg.content,
          });
        }

        // Add tool calls as parts
        msg.tool_calls.forEach((toolCall: any) => {
          parts.push({
            type: 'tool-call' as const,
            toolCallId: toolCall.id,
            toolName: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments),
            state: 'output-available' as const,
            providerExecuted: false,
          });
        });

        return {
          role: 'assistant' as const,
          parts,
        };
      }

      // Regular user, assistant, or system message
      const parts = [];
      if (msg.content && msg.content.trim()) {
        parts.push({
          type: 'text' as const,
          text: msg.content,
        });
      }

      return {
        role: msg.role as 'user' | 'assistant' | 'system',
        parts,
      };
    });
  }

  private normalizeEndpoint(endpoint: string): string {
    // For LM Studio and other OpenAI-compatible APIs, we need to strip the specific endpoint
    // and keep just the base URL for the AI SDK to work with
    if (endpoint.includes('/v1/chat/completions')) {
      return endpoint.replace('/v1/chat/completions', '/v1');
    }
    if (endpoint.includes('/chat/completions')) {
      return endpoint.replace('/chat/completions', '/v1');
    }
    // If no specific endpoint path, assume it's already a base URL
    if (!endpoint.endsWith('/v1')) {
      return endpoint + '/v1';
    }
    return endpoint;
  }

  /**
   * Send a streaming message with proper AI SDK tool call handling
   */
  async streamMessage(
    messages: any[],
    onChunk: (textOrUIMessage: string | { role: string; parts: any[]; text?: string }) => void,
    onComplete: (fullText: string, toolCalls?: any[], toolResults?: any[], uiMessage?: any) => void,
    onError: (error: string) => void,
    enableTools: boolean = false,
  ): Promise<void> {
    try {
      backgroundLogger.info('LLM Service streamMessage called', {
        enableTools,
        messageCount: messages?.length,
        availableToolsCount: Object.keys(availableTools).length,
        toolNames: Object.keys(availableTools),
      });
      if (!enableTools) {
        // Simple streaming without tools
        backgroundLogger.info('Simple streaming - converting messages', {
          messageCount: messages?.length || 0,
          messageType: typeof messages,
        });

        if (!messages || !Array.isArray(messages)) {
          throw new Error('messages is not an array: ' + typeof messages);
        }

        backgroundLogger.debug('Converting to UI messages...');
        const uiMessages = this.convertToUIMessages(messages);
        backgroundLogger.debug('About to call convertToModelMessages', {
          uiMessageCount: uiMessages?.length,
          uiMessages,
        });

        let modelMessages;
        try {
          // Validate that uiMessages is an array and has expected structure
          if (!Array.isArray(uiMessages)) {
            throw new Error(`uiMessages is not an array: ${typeof uiMessages}`);
          }

          if (uiMessages.length === 0) {
            throw new Error('uiMessages is empty');
          }

          // Log the structure of the first message to help debug
          backgroundLogger.debug('First UI message structure', { firstMessage: uiMessages[0] });

          modelMessages = convertToModelMessages(uiMessages);
          backgroundLogger.debug('convertToModelMessages succeeded');
        } catch (convertError) {
          backgroundLogger.error('convertToModelMessages failed', {
            error: convertError,
            uiMessages,
          });
          throw convertError;
        }

        const result = streamText({
          model: this.model,
          messages: modelMessages,
          temperature: 0.1,
        });

        let fullText = '';

        for await (const textChunk of result.textStream) {
          fullText += textChunk;
          onChunk(fullText);
        }

        await result.response;
        onComplete(fullText, [], []);
        return;
      }

      // Use AI SDK's streaming tool calling
      backgroundLogger.info('Starting AI SDK streaming tool-enabled generation');

      if (!messages || !Array.isArray(messages)) {
        throw new Error('messages is not an array: ' + typeof messages);
      }

      const uiMessages = this.convertToUIMessages(messages);
      backgroundLogger.debug('🔧 Tools: About to call convertToModelMessages', {
        uiMessageCount: uiMessages?.length,
        uiMessages,
      });

      let modelMessages;
      try {
        // Validate that uiMessages is an array and has expected structure
        if (!Array.isArray(uiMessages)) {
          throw new Error(`uiMessages is not an array: ${typeof uiMessages}`);
        }

        if (uiMessages.length === 0) {
          throw new Error('uiMessages is empty');
        }

        // Log the structure of the first message to help debug
        backgroundLogger.debug('🔧 Tools: First UI message structure', {
          firstMessage: uiMessages[0],
        });

        modelMessages = convertToModelMessages(uiMessages);
        backgroundLogger.debug('✅ Tools: convertToModelMessages succeeded');
      } catch (convertError) {
        backgroundLogger.error('💥 Tools: convertToModelMessages failed', {
          error: convertError,
          uiMessages,
        });
        throw convertError;
      }

      let finalText = '';

      const result = streamText({
        model: this.model,
        messages: modelMessages,
        tools: availableTools,
        temperature: 0.1,
        stopWhen: stepCountIs(50),
      });

      backgroundLogger.info('AI SDK streaming started');

      // Build UI message parts as we stream
      const messageParts: any[] = [];
      let lastTextIndex = 0;

      // Stream the full stream with all event types
      for await (const part of result.fullStream) {
        backgroundLogger.debug('Stream part received', { type: part.type });

        switch (part.type) {
          case 'text-delta':
            finalText += part.text;
            onChunk(finalText);
            break;

          case 'tool-call': {
            backgroundLogger.debug('Tool call received', {
              toolName: part.toolName,
              input: part.input,
            });

            // Add any new text that came before this tool call
            const textBeforeTool = finalText.substring(lastTextIndex);
            if (textBeforeTool.trim()) {
              messageParts.push({
                type: 'text',
                text: textBeforeTool,
              });
            }

            // Add tool call part
            const toolCallPart = {
              type: `tool-${part.toolName}`,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              input: part.input,
              state: 'input-available',
            };
            messageParts.push(toolCallPart);

            // Update text tracking position
            lastTextIndex = finalText.length;

            // Send real-time update with proper chronological ordering
            const toolCallUIMessage = {
              role: 'assistant',
              parts: [...messageParts],
              text: finalText,
            };
            onChunk(toolCallUIMessage);
            break;
          }

          case 'tool-result': {
            backgroundLogger.debug('Tool result received', {
              toolCallId: part.toolCallId,
              output: part.output,
              isError: (part as any).isError,
            });

            // Update the tool part with result or error
            const toolResultIndex = messageParts.findIndex((p) => p.toolCallId === part.toolCallId);
            if (toolResultIndex >= 0) {
              // Check if this is an error result (AI SDK isError flag or error object pattern)
              const isError =
                (part as any).isError ||
                (part.output &&
                  typeof part.output === 'object' &&
                  'error' in part.output &&
                  !('success' in part.output && part.output.success === true));

              if (isError) {
                messageParts[toolResultIndex].state = 'output-error';
                // Extract error message from various formats
                let errorText = 'Tool execution failed';
                if (typeof part.output === 'string') {
                  errorText = part.output;
                } else if (
                  part.output &&
                  typeof part.output === 'object' &&
                  'error' in part.output
                ) {
                  errorText = part.output.error;
                }
                messageParts[toolResultIndex].errorText = errorText;
              } else {
                messageParts[toolResultIndex].state = 'output-available';
                messageParts[toolResultIndex].output = part.output;
              }
            }

            // Add any new text that came after the tool call
            const textAfterTool = finalText.substring(lastTextIndex);
            if (textAfterTool.trim()) {
              messageParts.push({
                type: 'text',
                text: textAfterTool,
              });
              lastTextIndex = finalText.length;
            }

            // Send real-time update with tool result
            const toolResultUIMessage = {
              role: 'assistant',
              parts: [...messageParts],
              text: finalText,
            };
            onChunk(toolResultUIMessage);
            break;
          }

          case 'error':
            backgroundLogger.error('Stream error', { error: part });
            onError('Stream error occurred');
            return;
        }
      }

      // Add any remaining text after all tool calls
      const remainingText = finalText.substring(lastTextIndex);
      if (remainingText.trim()) {
        messageParts.push({
          type: 'text',
          text: remainingText,
        });
      }

      backgroundLogger.info('AI SDK streaming completed', {
        finalText: finalText.substring(0, 100),
        partsCount: messageParts.length,
      });

      // Create a UI message structure
      const uiMessage = {
        role: 'assistant',
        parts: messageParts,
      };

      onComplete(finalText, [], [], uiMessage);
    } catch (error) {
      backgroundLogger.error('AI SDK streaming error', {
        error: error instanceof Error ? error.message : error,
      });
      onError(error instanceof Error ? error.message : 'Unknown streaming error');
    }
  }

  /**
   * Test the connection using streaming (what we actually use)
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let resolved = false;

      // Set a timeout for the test
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve({ success: false, error: 'Connection test timeout' });
        }
      }, 30000); // 30 second timeout

      const testMessages = [
        {
          role: 'user',
          content: 'Hello, this is a connection test. Please respond briefly.',
        },
      ];

      this.streamMessage(
        testMessages,
        (_textOrUIMessage: string | { role: string; parts: any[]; text?: string }) => {
          // If we receive any chunk, the connection is working
        },
        (fullText: string) => {
          // On successful completion
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            backgroundLogger.debug('Test connection successful', {
              responseLength: fullText.length,
            });
            resolve({ success: true });
          }
        },
        (error: string) => {
          // On error
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            backgroundLogger.debug('Test connection failed', { error });
            resolve({ success: false, error });
          }
        },
        false, // No tools for connection test
      );
    });
  }
}

/**
 * Create an LLM service instance
 */
export function createLLMService(config: LLMProvider): LLMService {
  return new LLMService(config);
}
