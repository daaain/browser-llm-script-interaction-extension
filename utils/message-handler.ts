import browser from "webextension-polyfill";
import type { 
  MessageFromSidebar, 
  MessageToSidebar,
  ExtensionSettings,
  MigrationConfig
} from "~/utils/types";
import { DEFAULT_MIGRATION_CONFIG } from "~/utils/types";
import { settingsManager } from "~/utils/settings-manager";
import { chatManager } from "~/utils/chat-manager";
import { backgroundLogger } from "~/utils/debug-logger";

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
    sendResponse: (response: MessageToSidebar) => void
  ): Promise<void> {
    try {
      console.log("📨 AISDKMessageHandler.handleMessage called with:", message);
      const msg = message as MessageToSidebar | MessageFromSidebar;
      console.log("📍 Message type:", msg.type);
      
      switch (msg.type) {
        case "GET_SETTINGS":
          await this.handleGetSettings(sendResponse);
          break;

        case "SAVE_SETTINGS":
          await this.handleSaveSettings(msg.payload, sendResponse);
          break;

        case "SEND_MESSAGE":
          backgroundLogger.info("Handling SEND_MESSAGE", { 
            message: msg.payload.message?.substring(0, 50) + '...',
            tabId: msg.payload.tabId 
          });
          await this.handleSendMessage(msg.payload.message, msg.payload.tabId, sendResponse);
          break;


        case "CLEAR_TAB_CONVERSATION":
          await this.handleClearTabConversation(msg.payload.tabId, sendResponse);
          break;

        case "CAPTURE_SCREENSHOT":
          await this.handleCaptureScreenshot(sendResponse);
          break;

        default:
          console.error("Unknown message type:", (msg as any).type);
          this.sendErrorResponse(sendResponse, "Unknown message type");
      }
    } catch (error) {
      console.error("Message handler error:", error);
      this.sendErrorResponse(sendResponse, error instanceof Error ? error.message : "Unknown error occurred");
    }
  }

  private async handleGetSettings(sendResponse: (response: MessageToSidebar) => void): Promise<void> {
    console.log("Processing GET_SETTINGS request");
    const settings = await settingsManager.getSettings();
    
    // Ensure migration config is set
    if (!settings.migrationConfig) {
      settings.migrationConfig = DEFAULT_MIGRATION_CONFIG;
    }
    
    const response: MessageToSidebar = {
      type: "SETTINGS_RESPONSE",
      payload: settings,
    };
    console.log("Sending settings response:", response);
    sendResponse(response);
  }

  private async handleSaveSettings(
    settings: ExtensionSettings,
    sendResponse: (response: MessageToSidebar) => void
  ): Promise<void> {
    await settingsManager.saveSettings(settings);
    
    // Refresh chat manager
    chatManager.refreshLLMService();
    
    const response: MessageToSidebar = {
      type: "SETTINGS_RESPONSE",
      payload: { success: true },
    };
    sendResponse(response);
  }

  private async handleSendMessage(
    message: string,
    tabId: number | undefined,
    sendResponse: (response: MessageToSidebar) => void
  ): Promise<void> {
    console.log("💬 AISDKMessageHandler.handleSendMessage called with:", { message, tabId });
    
    try {
      // Get migration config
      const settings = await settingsManager.getSettings();
      const migrationConfig: MigrationConfig = settings.migrationConfig || DEFAULT_MIGRATION_CONFIG;
      
      let responseContent: string;
      
      console.log("🤖 Using chat manager");
      responseContent = await chatManager.sendChatMessage(message, tabId);
      
      console.log("✅ Chat manager returned:", { responseContent: responseContent.substring(0, 100) + '...' });
      
      const response: MessageToSidebar = {
        type: "MESSAGE_RESPONSE",
        payload: { content: responseContent },
      };
      
      console.log("📤 Sending response back to sidebar");
      sendResponse(response);
      
    } catch (error) {
      console.error("Error in handleSendMessage:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      
      const response: MessageToSidebar = {
        type: "ERROR",
        payload: { error: errorMessage },
      };
      
      sendResponse(response);
    }
  }


  private async handleClearTabConversation(
    tabId: number,
    sendResponse: (response: MessageToSidebar) => void
  ): Promise<void> {
    const updatedSettings = await settingsManager.clearTabConversation(tabId);
    const response: MessageToSidebar = {
      type: "SETTINGS_RESPONSE",
      payload: updatedSettings,
    };
    sendResponse(response);
  }

  private async handleCaptureScreenshot(sendResponse: (response: MessageToSidebar) => void): Promise<void> {
    try {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0 || !tabs[0].id) {
        sendResponse({ 
          type: "ERROR",
          payload: { success: false, error: "No active tab found" }
        });
        return;
      }

      const dataUrl = await browser.tabs.captureVisibleTab();
      sendResponse({ 
        type: "FUNCTION_RESPONSE",
        payload: { success: true, dataUrl }
      });
    } catch (error) {
      console.error("Screenshot capture error:", error);
      sendResponse({ 
        type: "ERROR",
        payload: { 
          success: false, 
          error: error instanceof Error ? error.message : "Screenshot failed" 
        }
      });
    }
  }

  private sendErrorResponse(sendResponse: (response: MessageToSidebar) => void, errorMessage: string): void {
    const response: MessageToSidebar = {
      type: "ERROR",
      payload: {
        error: errorMessage,
      },
    };
    sendResponse(response);
  }

  /**
   * Get service info for both implementations
   */
  async getServiceInfo() {
    try {
      const settings = await settingsManager.getSettings();
      const migrationConfig: MigrationConfig = settings.migrationConfig || DEFAULT_MIGRATION_CONFIG;
      
      const serviceInfo = chatManager.getServiceInfo();
      return {
        ...serviceInfo,
        implementation: 'Modern',
        provider: settings.provider.name
      };
    } catch (error) {
      return {
        supportsStreaming: false,
        supportsTools: false,
        toolsEnabled: false,
        availableTools: [],
        implementation: 'Unknown',
        error: error instanceof Error ? error.message : 'Service info unavailable'
      };
    }
  }
}

export const messageHandler = MessageHandler.getInstance();