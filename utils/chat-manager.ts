import { backgroundLogger } from '~/utils/debug-logger';
import { LLMService } from '~/utils/llm-service';
import { settingsManager } from '~/utils/settings-manager';
import type { ChatMessage, LLMProvider } from '~/utils/types';

/**
 * Chat Manager
 *
 * This provides LLM integration with streaming and tool calling capabilities.
 */
export class ChatManager {
  private static instance: ChatManager;
  private llmService: LLMService | null = null;

  static getInstance(): ChatManager {
    if (!ChatManager.instance) {
      ChatManager.instance = new ChatManager();
    }
    return ChatManager.instance;
  }

  private async ensureLLMService(): Promise<LLMService> {
    if (!this.llmService) {
      const settings = await settingsManager.getSettings();
      this.llmService = new LLMService(settings.provider);
    }
    return this.llmService;
  }

  // Message conversion is now handled in the LLM service layer

  /**
   * Send a chat message
   */
  async sendChatMessage(message: string, tabId?: number): Promise<string> {
    backgroundLogger.info('ChatManager.sendChatMessage called', {
      message: message.substring(0, 50),
      tabId,
    });

    try {
      backgroundLogger.debug('About to ensure LLM service...');
      await this.ensureLLMService();
      const settings = await settingsManager.getSettings();

      backgroundLogger.debug('Settings loaded', {
        endpoint: settings.provider.endpoint,
        model: settings.provider.model,
        toolsEnabled: settings.toolsEnabled,
      });

      // Create new user message
      const newUserMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: message,
        timestamp: Date.now(),
      };

      // Get conversation history
      const conversationHistory = await settingsManager.getTabConversation(tabId);
      const messagesForAPI = [...conversationHistory, newUserMessage];

      backgroundLogger.debug('📤 Messages for API', {
        messageCount: messagesForAPI.length,
        messages: messagesForAPI.map((m) => ({ role: m.role, contentType: typeof m.content })),
      });

      backgroundLogger.info(`📤 Sending message`, { messageCount: messagesForAPI.length });

      // Create initial streaming message
      const streamingMessageId = `streaming-${Date.now()}`;
      const streamingMessage: ChatMessage = {
        id: streamingMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      };

      let currentConversation = [...messagesForAPI, streamingMessage];

      // Update storage immediately
      if (tabId) {
        await settingsManager.updateTabConversation(tabId, currentConversation);
      } else {
        await settingsManager.updateGlobalHistory(currentConversation);
      }

      let finalContent = '';

      // Setup streaming callbacks
      const onChunk = async (
        textOrUIMessage: string | { role: string; parts: any[]; text?: string },
      ) => {
        if (typeof textOrUIMessage === 'string') {
          // Handle text streaming
          backgroundLogger.debug('🎯 Streaming text chunk', {
            text: textOrUIMessage.substring(0, 100) + (textOrUIMessage.length > 100 ? '...' : ''),
          });

          streamingMessage.content = textOrUIMessage;
        } else {
          // Handle UI message with parts (tool streaming)
          backgroundLogger.debug('🎯 Streaming UI message', {
            partsCount: textOrUIMessage.parts?.length || 0,
            text:
              textOrUIMessage.text?.substring(0, 100) +
              (textOrUIMessage.text && textOrUIMessage.text.length > 100 ? '...' : ''),
          });

          (streamingMessage as any).parts = textOrUIMessage.parts;
          streamingMessage.content = textOrUIMessage.text || '';
        }

        currentConversation = [...messagesForAPI, streamingMessage];

        // Update storage with streaming content
        try {
          if (tabId) {
            await settingsManager.updateTabConversation(tabId, currentConversation);
          } else {
            await settingsManager.updateGlobalHistory(currentConversation);
          }
        } catch (error) {
          backgroundLogger.error('Error updating streaming message', { error });
        }
      };

      const onComplete = async (
        text: string,
        _toolCalls?: any[],
        _toolResults?: any[],
        uiMessage?: any,
      ) => {
        backgroundLogger.info('✅ Streaming complete', {
          text: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
          hasUIMessage: !!uiMessage,
          uiMessageParts: uiMessage?.parts?.length || 0,
        });

        finalContent = text;
        streamingMessage.isStreaming = false;

        // Use the UI message parts directly from AI SDK
        if (uiMessage && uiMessage.parts) {
          (streamingMessage as any).parts = uiMessage.parts;
          streamingMessage.content = text; // Also store text for backward compatibility
          backgroundLogger.debug('Using AI SDK UI message parts', {
            partsCount: uiMessage.parts.length,
          });
        } else {
          // Fallback to plain text content
          streamingMessage.content = text;
          backgroundLogger.debug('Using plain text content (no UI parts)');
        }

        currentConversation = [...messagesForAPI, streamingMessage];

        // Final storage update
        if (tabId) {
          await settingsManager.updateTabConversation(tabId, currentConversation);
        } else {
          await settingsManager.updateGlobalHistory(currentConversation);
        }
      };

      const onError = async (error: string) => {
        backgroundLogger.error('❌ AI SDK returned error', { error });

        streamingMessage.content = `❌ Error: ${error}`;
        streamingMessage.isStreaming = false;

        currentConversation = [...messagesForAPI, streamingMessage];

        if (tabId) {
          await settingsManager.updateTabConversation(tabId, currentConversation);
        } else {
          await settingsManager.updateGlobalHistory(currentConversation);
        }

        finalContent = error;
      };

      // Start streaming
      backgroundLogger.info('About to call llmService.streamMessage', {
        messageCount: messagesForAPI.length,
        toolsEnabled: settings.toolsEnabled,
      });
      await this.llmService!.streamMessage(
        messagesForAPI,
        onChunk,
        onComplete,
        onError,
        settings.toolsEnabled,
      );
      backgroundLogger.info('llmService.streamMessage completed');

      return finalContent;
    } catch (error) {
      backgroundLogger.error('Exception in ChatManager.sendChatMessage', {
        error: error instanceof Error ? error.message : error,
      });
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Try to update storage with error message
      try {
        const conversationHistory = await settingsManager.getTabConversation(tabId);

        const newUserMessage: ChatMessage = {
          id: Date.now().toString(),
          role: 'user',
          content: message,
          timestamp: Date.now(),
        };

        const errorResponseMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `❌ Error: ${errorMessage}`,
          timestamp: Date.now(),
        };

        const updatedConversation = [...conversationHistory, newUserMessage, errorResponseMessage];

        if (tabId) {
          await settingsManager.updateTabConversation(tabId, updatedConversation);
        } else {
          await settingsManager.updateGlobalHistory(updatedConversation);
        }
      } catch (storageError) {
        backgroundLogger.error('Error updating storage with error message', {
          error: storageError,
        });
      }

      return errorMessage;
    }
  }

  /**
   * Refresh the LLM service (force recreation)
   */
  refreshLLMService(): void {
    this.llmService = null;
  }

  /**
   * Update provider configuration
   */
  async updateProvider(provider: LLMProvider): Promise<void> {
    if (this.llmService) {
      this.llmService.updateProvider(provider);
    } else {
      // Service will be created with new config on next use
      this.refreshLLMService();
    }
  }

  /**
   * Get service information
   */
  getServiceInfo() {
    return {
      supportsStreaming: true,
      supportsTools: true,
      toolsEnabled: true, // Will be determined by settings
      availableTools: [
        'screenshot',
        'find',
        'extract',
        'summary',
        'click',
        'type',
        'scroll',
        'wait',
      ],
      provider: 'LLM Service',
    };
  }
}

// Export as singleton
export const chatManager = ChatManager.getInstance();
