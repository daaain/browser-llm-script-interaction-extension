import browser from "webextension-polyfill";
import { defineBackground } from "wxt/utils/define-background";
import type {
  ChatMessage,
  ExtensionSettings,
  MessageFromSidebar,
  MessageToSidebar,
  ContentScriptFunctionRequest,
  ContentScriptFunctionResponse,
} from "~/utils/types";
import { DEFAULT_PROVIDERS } from "~/utils/types";
import { DEFAULT_TRUNCATION_LIMIT } from "~/utils/constants";
import { LLMService } from "~/utils/llm-service";
import { isValidLLMHelperMethod, parseToolCallArguments } from "~/utils/tool-schema-generator";
import type { LLMToolCall } from "~/utils/types";

let llmService: LLMService | null = null;

async function getSettings(): Promise<ExtensionSettings> {
  console.log("Getting settings from storage...");

  try {
    // Use local storage for better Firefox compatibility
    const result = await browser.storage.local.get(["settings"]);
    console.log("Storage result:", result);

    if (result.settings) {
      console.log("Found existing settings");
      // Ensure required properties exist in existing settings
      const settings = result.settings as ExtensionSettings;
      let needsUpdate = false;
      
      if (typeof settings.debugMode === 'undefined') {
        settings.debugMode = false;
        needsUpdate = true;
        console.log("Added missing debugMode to existing settings");
      }
      
      if (typeof settings.truncationLimit === 'undefined') {
        settings.truncationLimit = DEFAULT_TRUNCATION_LIMIT;
        needsUpdate = true;
        console.log("Added missing truncationLimit to existing settings");
      }
      
      if (typeof settings.toolsEnabled === 'undefined') {
        settings.toolsEnabled = true;
        needsUpdate = true;
        console.log("Added missing toolsEnabled to existing settings");
      }
      
      if (needsUpdate) {
        await browser.storage.local.set({ settings });
      }
      
      return settings;
    }

    console.log("No settings found, creating defaults");
    const defaultSettings: ExtensionSettings = {
      provider: {
        ...DEFAULT_PROVIDERS[0],
        apiKey: "",
      },
      chatHistory: [],
      debugMode: false,
      truncationLimit: DEFAULT_TRUNCATION_LIMIT,
      toolsEnabled: true,
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
    llmService = new LLMService(settings.provider, settings.toolsEnabled);
  } catch (error) {
    console.error("Error saving settings:", error);
    throw error;
  }
}

async function sendChatMessage(message: string, tabId?: number): Promise<string> {
  if (!llmService) {
    const settings = await getSettings();
    llmService = new LLMService(settings.provider, settings.toolsEnabled);
  }

  const settings = await getSettings();

  const newMessage: ChatMessage = {
    id: Date.now().toString(),
    role: "user",
    content: message,
    timestamp: Date.now(),
  };

  // Get conversation history for this tab or use global if no tabId
  const conversationHistory = tabId 
    ? (settings.tabConversations?.[tabId.toString()] || [])
    : settings.chatHistory;

  const messagesForAPI = [...conversationHistory, newMessage];
  
  // Include tools if enabled and we haven't already used tools in this conversation
  const hasToolCalls = conversationHistory.some(msg => msg.tool_calls && msg.tool_calls.length > 0);
  const shouldIncludeTools = settings.toolsEnabled && !hasToolCalls;
  const finalTools = shouldIncludeTools ? llmService.getAvailableTools() : undefined;
  
  console.log(`Sending message with tools: ${finalTools ? 'enabled' : 'disabled'}, hasToolCalls: ${hasToolCalls}`);
  
  // Create a temporary streaming message for real-time updates
  const streamingMessageId = `streaming-${Date.now()}`;
  let streamingMessage: ChatMessage = {
    id: streamingMessageId,
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    isStreaming: true, // Add flag to indicate streaming
  };

  // Add streaming message to conversation immediately
  let currentConversation = [...messagesForAPI, streamingMessage];
  
  // Save the initial streaming message
  if (tabId) {
    const tabConversations = settings.tabConversations || {};
    tabConversations[tabId.toString()] = currentConversation;
    await browser.storage.local.set({ 
      settings: { ...settings, tabConversations } 
    });
  } else {
    await browser.storage.local.set({ 
      settings: { ...settings, chatHistory: currentConversation } 
    });
  }

  // Debounced storage update for streaming
  let updateTimeout: NodeJS.Timeout | null = null;
  const updateStorage = async (content: string, isComplete: boolean) => {
    streamingMessage.content = content;
    if (isComplete) {
      delete (streamingMessage as any).isStreaming;
    }
    
    // Update conversation
    currentConversation = [...messagesForAPI, streamingMessage];
    
    // Debounce storage updates (except for completion)
    if (updateTimeout && !isComplete) {
      clearTimeout(updateTimeout);
    }
    
    const doUpdate = async () => {
      try {
        if (tabId) {
          const currentSettings = await getSettings();
          const tabConversations = currentSettings.tabConversations || {};
          tabConversations[tabId.toString()] = currentConversation;
          await browser.storage.local.set({ 
            settings: { ...currentSettings, tabConversations } 
          });
        } else {
          const currentSettings = await getSettings();
          await browser.storage.local.set({ 
            settings: { ...currentSettings, chatHistory: currentConversation } 
          });
        }
      } catch (error) {
        console.error("Error updating streaming message:", error);
      }
    };
    
    if (isComplete) {
      await doUpdate();
    } else {
      updateTimeout = setTimeout(doUpdate, 100); // 100ms debounce
    }
  };

  const response = await llmService.sendMessage(messagesForAPI, finalTools, updateStorage);

  if (response.error) {
    throw new Error(response.error);
  }

  // Update the streaming message with final content and tool calls
  streamingMessage.content = response.content;
  streamingMessage.tool_calls = response.tool_calls;
  delete (streamingMessage as any).isStreaming;

  let updatedConversation = [...messagesForAPI, streamingMessage];
  
  // Handle tool calls if present
  if (response.tool_calls && response.tool_calls.length > 0) {
    console.log(`Processing ${response.tool_calls.length} tool calls`);
    
    // Execute each tool call and collect results
    const toolResults: Array<{id: string, result: any, error?: string}> = [];
    
    for (const toolCall of response.tool_calls) {
      try {
        const toolResult = await executeToolCall(toolCall);
        
        // Special handling for screenshot results
        if (toolCall.function.name === 'screenshot' && typeof toolResult.result === 'string' && toolResult.result.startsWith('data:image/')) {
          // For screenshots, we want to store the image for both display and LLM analysis
          toolResults.push({
            id: toolCall.id,
            result: {
              type: 'screenshot',
              dataUrl: toolResult.result,
              description: 'Screenshot captured successfully'
            }
          });
        } else {
          toolResults.push({
            id: toolCall.id,
            result: toolResult.result
          });
        }
        
        console.log(`Tool call ${toolCall.function.name} executed successfully`);
      } catch (error) {
        console.error(`Error executing tool call ${toolCall.function.name}:`, error);
        toolResults.push({
          id: toolCall.id,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Add tool results to the streaming message
    streamingMessage.tool_results = toolResults;
    
    // Update storage to show tool execution completed
    currentConversation = [...messagesForAPI, streamingMessage];
    if (tabId) {
      const currentSettings = await getSettings();
      const tabConversations = currentSettings.tabConversations || {};
      tabConversations[tabId.toString()] = currentConversation;
      await browser.storage.local.set({ 
        settings: { ...currentSettings, tabConversations } 
      });
    } else {
      const currentSettings = await getSettings();
      await browser.storage.local.set({ 
        settings: { ...currentSettings, chatHistory: currentConversation } 
      });
    }
    
    // Build conversation for final LLM call (including tool results as separate messages)
    const conversationForFinalCall = [...messagesForAPI, streamingMessage];
    
    // Check if there are any screenshot results
    const screenshotResults = toolResults.filter(tr => 
      tr.result && 
      typeof tr.result === 'object' && 
      tr.result.type === 'screenshot' && 
      tr.result.dataUrl
    );
    
    // Add regular tool results as text-only tool messages
    for (const toolResult of toolResults) {
      conversationForFinalCall.push({
        id: `tool-${toolResult.id}`,
        role: "tool" as const,
        content: toolResult.error ? `Error: ${toolResult.error}` : 
                 (toolResult.result?.type === 'screenshot' ? 'Screenshot captured successfully' : JSON.stringify(toolResult.result)),
        timestamp: Date.now(),
        tool_call_id: toolResult.id,
      });
    }
    
    // If there are screenshots, add them as a follow-up user message with images
    if (screenshotResults.length > 0) {
      const imageContent: Array<{
        type: "text" | "input_image";
        text?: string;
        image_url?: { url: string };
      }> = [
        {
          type: "text" as const,
          text: "Here is the screenshot:"
        },
        ...screenshotResults.map(sr => ({
          type: "input_image" as const,
          image_url: {
            url: sr.result.dataUrl
          }
        }))
      ];
      
      conversationForFinalCall.push({
        id: `screenshot-analysis-${Date.now()}`,
        role: "user" as const,
        content: imageContent,
        timestamp: Date.now(),
      });
    }
    
    // Get final response from LLM with tool results
    try {
      const finalResponseCallback = async (content: string, isComplete: boolean) => {
        // Update the streaming message with final content
        streamingMessage.content = content;
        if (isComplete) {
          delete (streamingMessage as any).isStreaming;
        }
        
        // Update conversation with final response
        currentConversation = [...messagesForAPI, streamingMessage];
        
        // Update storage with debouncing for final response
        const doUpdate = async () => {
          try {
            if (tabId) {
              const currentSettings = await getSettings();
              const tabConversations = currentSettings.tabConversations || {};
              tabConversations[tabId.toString()] = currentConversation;
              await browser.storage.local.set({ 
                settings: { ...currentSettings, tabConversations } 
              });
            } else {
              const currentSettings = await getSettings();
              await browser.storage.local.set({ 
                settings: { ...currentSettings, chatHistory: currentConversation } 
              });
            }
          } catch (error) {
            console.error("Error updating final response:", error);
          }
        };
        
        if (isComplete) {
          await doUpdate();
        } else {
          // Small debounce for final response streaming
          setTimeout(doUpdate, 50);
        }
      };
      
      const finalResponse = await llmService.sendMessage(conversationForFinalCall, undefined, finalResponseCallback);
      
      if (finalResponse.content) {
        // Update the streaming message with final content
        streamingMessage.content = finalResponse.content;
        delete (streamingMessage as any).isStreaming;
        
        // Return the final response content
        response.content = finalResponse.content;
      }
    } catch (error) {
      console.error("Error getting final response after tool calls:", error);
      // Keep the original tool call response
    }
  }

  // Final save to conversation history (only if no tool calls, as tool calls handle their own saves)
  if (!response.tool_calls || response.tool_calls.length === 0) {
    if (tabId) {
      const tabConversations = settings.tabConversations || {};
      tabConversations[tabId.toString()] = updatedConversation;
      
      await saveSettings({
        ...settings,
        tabConversations,
      });
    } else {
      await saveSettings({
        ...settings,
        chatHistory: updatedConversation,
      });
    }
  }

  return typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
}

async function executeToolCall(toolCall: LLMToolCall): Promise<ContentScriptFunctionResponse> {
  const { name: functionName, arguments: argumentsString } = toolCall.function;
  
  // Validate that this is a valid LLMHelper method
  if (!isValidLLMHelperMethod(functionName)) {
    throw new Error(`Invalid tool function: ${functionName}`);
  }
  
  // Parse and validate arguments
  const args = parseToolCallArguments(functionName, argumentsString);
  
  // Execute the function via content script
  return await executeContentScriptFunction(functionName, args);
}

async function executeContentScriptFunction(
  functionName: string,
  args: any
): Promise<ContentScriptFunctionResponse> {
  try {
    // Get the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      return { success: false, error: "No active tab found" };
    }

    const activeTab = tabs[0];
    if (!activeTab.id) {
      return { success: false, error: "Active tab has no ID" };
    }

    // Send message to content script
    const request: ContentScriptFunctionRequest = {
      type: "EXECUTE_FUNCTION",
      function: functionName,
      arguments: args,
    };

    const response = await browser.tabs.sendMessage(activeTab.id, request);
    const functionResponse = response as ContentScriptFunctionResponse;

    // If the function executed successfully, save the result to chat history
    if (functionResponse.success) {
      await saveFunctionResultToChat(functionName, args, functionResponse.result);
    }

    return functionResponse;
  } catch (error) {
    console.error("Error executing content script function:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function saveFunctionResultToChat(
  functionName: string,
  args: any,
  result: any
): Promise<void> {
  try {
    const settings = await getSettings();
    
    // Get the active tab to save to the correct conversation
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTabId = tabs[0]?.id;
    
    // Create a user message for the function call
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: `LLMHelper.${functionName}(${Object.keys(args).length > 0 ? JSON.stringify(args) : ''})`,
      timestamp: Date.now(),
    };

    // Create an assistant message with the result
    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: `**${functionName} Result:**\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
      timestamp: Date.now(),
    };

    // Save to appropriate conversation history
    if (activeTabId) {
      const tabConversations = settings.tabConversations || {};
      const currentTabHistory = tabConversations[activeTabId.toString()] || [];
      const updatedTabHistory = [...currentTabHistory, userMessage, assistantMessage];
      
      tabConversations[activeTabId.toString()] = updatedTabHistory;
      
      await saveSettings({
        ...settings,
        tabConversations,
      });
    } else {
      // Fallback to global history if no active tab
      const updatedHistory = [...settings.chatHistory, userMessage, assistantMessage];
      await saveSettings({
        ...settings,
        chatHistory: updatedHistory,
      });
    }
  } catch (error) {
    console.error("Error saving function result to chat:", error);
  }
}

async function clearTabConversation(tabId: number): Promise<ExtensionSettings> {
  try {
    const settings = await getSettings();
    
    // Clear the conversation for the specific tab
    if (settings.tabConversations && settings.tabConversations[tabId.toString()]) {
      delete settings.tabConversations[tabId.toString()];
    }
    
    // Also clear global history if this was the active tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTabId = tabs[0]?.id;
    
    if (activeTabId === tabId) {
      settings.chatHistory = [];
    }
    
    await saveSettings(settings);
    return settings;
  } catch (error) {
    console.error('Error clearing tab conversation:', error);
    throw error;
  }
}

export default defineBackground({
  persistent: true,
  main() {
    console.log("Background script starting...");
    
    // Configure sidepanel to open automatically when action icon is clicked
    if ((browser as any).sidePanel) {
      console.log("Chrome: Setting up sidePanel");
      (browser as any).sidePanel
        .setPanelBehavior({ openPanelOnActionClick: true })
        .catch((error: any) => console.error("Error setting panel behavior:", error));
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
          const msg = message as MessageToSidebar | MessageFromSidebar;
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
              const responseContent = await sendChatMessage(msg.payload.message, msg.payload.tabId);
              const response: MessageToSidebar = {
                type: "MESSAGE_RESPONSE",
                payload: { content: responseContent },
              };
              sendResponse(response);
              break;
            }

            case "EXECUTE_FUNCTION": {
              const functionResponse = await executeContentScriptFunction(
                msg.payload.function,
                msg.payload.arguments
              );
              const response: MessageToSidebar = {
                type: "FUNCTION_RESPONSE",
                payload: functionResponse,
              };
              sendResponse(response);
              break;
            }

            case "CLEAR_TAB_CONVERSATION": {
              const updatedSettings = await clearTabConversation(msg.payload.tabId);
              const response: MessageToSidebar = {
                type: "SETTINGS_RESPONSE",
                payload: updatedSettings,
              };
              sendResponse(response);
              break;
            }

            case "CAPTURE_SCREENSHOT": {
              try {
                // Get the active tab
                const tabs = await browser.tabs.query({ active: true, currentWindow: true });
                if (tabs.length === 0 || !tabs[0].id) {
                  sendResponse({ success: false, error: "No active tab found" });
                  break;
                }

                // Capture screenshot
                const dataUrl = await browser.tabs.captureVisibleTab();
                sendResponse({ success: true, dataUrl });
              } catch (error) {
                console.error("Screenshot capture error:", error);
                sendResponse({ 
                  success: false, 
                  error: error instanceof Error ? error.message : "Screenshot failed" 
                });
              }
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