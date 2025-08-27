import browser from 'webextension-polyfill';
import { chatManager } from '~/utils/chat-manager';
import { backgroundLogger } from '~/utils/debug-logger';
import { createLLMService } from '~/utils/llm-service';
import { responseManager } from '~/utils/response-manager';
import { settingsManager } from '~/utils/settings-manager';
import type { ExtensionSettings, MessageFromSidebar, MessageToSidebar } from '~/utils/types';

/**
 * Message Handler
 *
 * This message handler manages all communication between the extension UI and background services.
 */
export class MessageHandler {
  private static instance: MessageHandler;

  static getInstance(): MessageHandler {
    if (!MessageHandler.instance) {
      MessageHandler.instance = new MessageHandler();
    }
    return MessageHandler.instance;
  }

  async handleMessage(
    message: unknown,
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    try {
      console.log('📨 AISDKMessageHandler.handleMessage called with:', message);
      const msg = message as MessageToSidebar | MessageFromSidebar;
      console.log('📍 Message type:', msg.type);

      switch (msg.type) {
        case 'GET_SETTINGS':
          await this.handleGetSettings(sendResponse);
          break;

        case 'SAVE_SETTINGS':
          await this.handleSaveSettings(msg.payload, sendResponse);
          break;

        case 'SEND_MESSAGE':
          backgroundLogger.info('Handling SEND_MESSAGE', {
            message: msg.payload.message?.substring(0, 50) + '...',
            tabId: msg.payload.tabId,
          });
          await this.handleSendMessage(msg.payload.message, msg.payload.tabId, sendResponse);
          break;

        case 'CLEAR_TAB_CONVERSATION':
          await this.handleClearTabConversation(msg.payload.tabId, sendResponse);
          break;

        case 'CAPTURE_SCREENSHOT':
          await this.handleCaptureScreenshot(sendResponse);
          break;
        case 'TEST_CONNECTION':
          await this.handleTestConnection(sendResponse);
          break;

        case 'EXECUTE_FUNCTION':
          await this.handleExecuteFunction((msg as any).payload, sendResponse);
          break;

        case 'GET_RESPONSE_PAGE':
          await this.handleGetResponsePage((msg as any).payload, sendResponse);
          break;

        default:
          console.error('Unknown message type:', (msg as any).type);
          this.sendErrorResponse(sendResponse, 'Unknown message type');
      }
    } catch (error) {
      console.error('Message handler error:', error);
      this.sendErrorResponse(
        sendResponse,
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
    }
  }

  private async handleGetSettings(
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    console.log('Processing GET_SETTINGS request');
    const settings = await settingsManager.getSettings();

    const response: MessageToSidebar = {
      type: 'SETTINGS_RESPONSE',
      payload: settings,
    };
    console.log('Sending settings response:', response);
    sendResponse(response);
  }

  private async handleSaveSettings(
    settings: ExtensionSettings,
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    await settingsManager.saveSettings(settings);

    // Refresh chat manager
    chatManager.refreshLLMService();

    const response: MessageToSidebar = {
      type: 'SETTINGS_RESPONSE',
      payload: { success: true },
    };
    sendResponse(response);
  }

  private async handleSendMessage(
    message: string,
    tabId: number | undefined,
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    console.log('💬 AISDKMessageHandler.handleSendMessage called with:', { message, tabId });

    try {
      let responseContent: string;

      console.log('🤖 Using chat manager');
      responseContent = await chatManager.sendChatMessage(message, tabId);

      console.log('✅ Chat manager returned:', {
        responseContent: responseContent.substring(0, 100) + '...',
      });

      const response: MessageToSidebar = {
        type: 'MESSAGE_RESPONSE',
        payload: { content: responseContent },
      };

      console.log('📤 Sending response back to sidebar');
      sendResponse(response);
    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      const response: MessageToSidebar = {
        type: 'ERROR',
        payload: { error: errorMessage },
      };

      sendResponse(response);
    }
  }

  private async handleClearTabConversation(
    tabId: number,
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    const updatedSettings = await settingsManager.clearTabConversation(tabId);
    const response: MessageToSidebar = {
      type: 'SETTINGS_RESPONSE',
      payload: updatedSettings,
    };
    sendResponse(response);
  }

  private async handleCaptureScreenshot(
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0 || !tabs[0].id) {
        sendResponse({
          type: 'ERROR',
          payload: { success: false, error: 'No active tab found' },
        });
        return;
      }

      const dataUrl = await browser.tabs.captureVisibleTab();
      sendResponse({
        type: 'FUNCTION_RESPONSE',
        payload: { success: true, dataUrl },
      });
    } catch (error) {
      console.error('Screenshot capture error:', error);
      sendResponse({
        type: 'ERROR',
        payload: {
          success: false,
          error: error instanceof Error ? error.message : 'Screenshot failed',
        },
      });
    }
  }

  private sendErrorResponse(
    sendResponse: (response: MessageToSidebar) => void,
    errorMessage: string,
  ): void {
    const response: MessageToSidebar = {
      type: 'ERROR',
      payload: {
        error: errorMessage,
      },
    };
    sendResponse(response);
  }

  private async handleTestConnection(
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    try {
      backgroundLogger.info('Processing TEST_CONNECTION request');

      // Get the current settings to create LLM service
      const settings = await settingsManager.getSettings();
      const llmService = createLLMService(settings.provider);
      const result = await llmService.testConnection();

      const response: MessageToSidebar = {
        type: 'TEST_CONNECTION_RESPONSE',
        payload: result,
      };
      backgroundLogger.info('Sending test connection response', { result });
      sendResponse(response);
    } catch (error) {
      backgroundLogger.error('Test connection error', { error });
      this.sendErrorResponse(
        sendResponse,
        error instanceof Error ? error.message : 'Connection test failed',
      );
    }
  }

  private async handleExecuteFunction(
    payload: { function: string; arguments: any },
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    try {
      backgroundLogger.info('Processing EXECUTE_FUNCTION request', {
        function: payload.function,
        args: payload.arguments,
      });

      // Get current active tab
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const activeTab = tabs[0];

      if (!activeTab?.id) {
        this.sendErrorResponse(sendResponse, 'No active tab found');
        return;
      }

      // Send function execution request to content script in active tab
      const functionMessage = {
        type: 'EXECUTE_FUNCTION',
        function: payload.function,
        arguments: payload.arguments,
      };

      const result = await browser.tabs.sendMessage(activeTab.id, functionMessage);

      const response: MessageToSidebar = {
        type: 'FUNCTION_RESPONSE',
        payload: result,
      };
      backgroundLogger.info('Function executed successfully', { result });
      sendResponse(response);
    } catch (error) {
      backgroundLogger.error('Function execution error', { error });
      this.sendErrorResponse(
        sendResponse,
        error instanceof Error ? error.message : 'Function execution failed',
      );
    }
  }

  private async handleGetResponsePage(
    payload: { responseId: string; page: number },
    sendResponse: (response: MessageToSidebar) => void,
  ): Promise<void> {
    try {
      backgroundLogger.info('Processing GET_RESPONSE_PAGE request', payload);

      if (!responseManager.hasResponse(payload.responseId)) {
        this.sendErrorResponse(sendResponse, 'Response not found or expired');
        return;
      }

      const pageResult = responseManager.getPage(payload.responseId, payload.page);

      const response: MessageToSidebar = {
        type: 'RESPONSE_PAGE',
        payload: {
          success: true,
          result: pageResult.content,
          _meta: {
            isTruncated: pageResult.isTruncated,
            originalLength: pageResult.originalLength,
            currentPage: pageResult.currentPage,
            totalPages: pageResult.totalPages,
            hasMore: pageResult.hasMore,
            hasPrevious: pageResult.hasPrevious,
            responseId: pageResult.responseId,
          },
        },
      };

      backgroundLogger.info('Response page retrieved successfully', {
        responseId: payload.responseId,
        page: payload.page,
        contentLength: pageResult.content.length,
      });
      sendResponse(response);
    } catch (error) {
      backgroundLogger.error('Get response page error', { error, payload });
      this.sendErrorResponse(
        sendResponse,
        error instanceof Error ? error.message : 'Failed to get response page',
      );
    }
  }

  /**
   * Get service info for both implementations
   */
  async getServiceInfo() {
    try {
      const settings = await settingsManager.getSettings();

      const serviceInfo = chatManager.getServiceInfo();
      return {
        ...serviceInfo,
        implementation: 'Modern',
        provider: settings.provider.name,
      };
    } catch (error) {
      return {
        supportsStreaming: false,
        supportsTools: false,
        toolsEnabled: false,
        availableTools: [],
        implementation: 'Unknown',
        error: error instanceof Error ? error.message : 'Service info unavailable',
      };
    }
  }
}

export const messageHandler = MessageHandler.getInstance();
