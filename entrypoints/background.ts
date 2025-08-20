import browser from "webextension-polyfill";
import type {
  ChatMessage,
  ExtensionSettings,
  MessageFromSidebar,
  MessageToSidebar,
} from "~/utils/types";
import { DEFAULT_PROVIDERS } from "~/utils/types";
import { LLMService } from "~/utils/llm-service";

let llmService: LLMService | null = null;

async function getSettings(): Promise<ExtensionSettings> {
  console.log("Getting settings from storage...");

  try {
    // Use local storage for better Firefox compatibility
    const result = await browser.storage.local.get(["settings"]);
    console.log("Storage result:", result);

    if (result.settings) {
      console.log("Found existing settings");
      return result.settings as ExtensionSettings;
    }

    console.log("No settings found, creating defaults");
    const defaultSettings: ExtensionSettings = {
      provider: {
        ...DEFAULT_PROVIDERS[0],
        apiKey: "",
      },
      chatHistory: [],
    };

    await browser.storage.local.set({ settings: defaultSettings });
    console.log("Default settings saved");
    return defaultSettings;
  } catch (error) {
    console.error("Error accessing storage:", error);
    throw error;
  }
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
  console.log("Saving settings:", settings);

  try {
    await browser.storage.local.set({ settings });
    console.log("Settings saved successfully");
    llmService = new LLMService(settings.provider);
  } catch (error) {
    console.error("Error saving settings:", error);
    throw error;
  }
}

async function sendChatMessage(message: string): Promise<string> {
  if (!llmService) {
    const settings = await getSettings();
    llmService = new LLMService(settings.provider);
  }

  const settings = await getSettings();

  const newMessage: ChatMessage = {
    id: Date.now().toString(),
    role: "user",
    content: message,
    timestamp: Date.now(),
  };

  const messagesForAPI = [...settings.chatHistory, newMessage];

  const response = await llmService.sendMessage(messagesForAPI);

  if (response.error) {
    throw new Error(response.error);
  }

  const assistantMessage: ChatMessage = {
    id: (Date.now() + 1).toString(),
    role: "assistant",
    content: response.content,
    timestamp: Date.now(),
  };

  const updatedHistory = [...messagesForAPI, assistantMessage];

  await saveSettings({
    ...settings,
    chatHistory: updatedHistory,
  });

  return response.content;
}

export default defineBackground({
  persistent: true,
  main() {
    console.log("Background script starting...");
    
    // Configure sidepanel to open automatically when action icon is clicked
    if (browser.sidePanel) {
      console.log("Chrome: Setting up sidePanel");
      browser.sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error) => console.error("Error setting panel behavior:", error));
    }
    
    // Fallback for Firefox - open sidebar when action is clicked
    if (browser.sidebarAction) {
      console.log("Firefox: Setting up sidebarAction");
      browser.browserAction.onClicked.addListener(async () => {
        try {
          await browser.sidebarAction.open();
        } catch (error) {
          console.error("Error opening sidebar:", error);
        }
      });
    }

    console.log("Setting up message listener...");
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      const handleMessage = async () => {
        try {
          console.log("Received message:", message);
          const msg = message as MessageFromSidebar;
          switch (msg.type) {
            case "GET_SETTINGS": {
              console.log("Processing GET_SETTINGS request");
              const settings = await getSettings();
              const response: MessageToSidebar = {
                type: "SETTINGS_RESPONSE",
                payload: settings,
              };
              console.log("Sending settings response:", response);
              sendResponse(response);
              break;
            }

            case "SAVE_SETTINGS": {
              await saveSettings(msg.payload);
              const response: MessageToSidebar = {
                type: "SETTINGS_RESPONSE",
                payload: { success: true },
              };
              sendResponse(response);
              break;
            }

            case "SEND_MESSAGE": {
              const responseContent = await sendChatMessage(msg.payload.message);
              const response: MessageToSidebar = {
                type: "MESSAGE_RESPONSE",
                payload: { content: responseContent },
              };
              sendResponse(response);
              break;
            }

            default:
              console.error("Unknown message type:", msg.type);
          }
        } catch (error) {
          console.error("Background script error:", error);
          const response: MessageToSidebar = {
            type: "ERROR",
            payload: {
              error: error instanceof Error ? error.message : "Unknown error occurred",
            },
          };
          sendResponse(response);
        }
      };

      handleMessage();
      return true; // Keep message channel open for async response
    });

    console.log("Background service worker loaded");
  },
});