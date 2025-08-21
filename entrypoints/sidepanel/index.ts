import browser from "webextension-polyfill";
import type {
  ChatMessage,
  ExtensionSettings,
  MessageFromSidebar,
  MessageToSidebar,
} from "~/utils/types";

class ChatInterface {
  private currentSettings: ExtensionSettings | null = null;
  private messagesContainer: HTMLElement;
  private messageInput: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private statusElement: HTMLElement;
  private tabId: number | null = null;
  private lastDisplayedHistoryLength: number = 0;
  private isRefreshing: boolean = false;

  constructor() {
    this.messagesContainer = document.getElementById("messages")!;
    this.messageInput = document.getElementById("message-input") as HTMLTextAreaElement;
    this.sendButton = document.getElementById("send-btn") as HTMLButtonElement;
    this.statusElement = document.getElementById("status")!;

    this.init();
  }

  private async init() {
    await this.getCurrentTab();
    await this.loadSettings();
    this.setupEventListeners();
    
    // Initialize tracking
    const currentHistory = this.getTabChatHistory(this.currentSettings);
    this.lastDisplayedHistoryLength = currentHistory.length;
    
    this.displayChatHistory();
    this.setupStorageListener();
    this.setupTabChangeListener();
  }

  private async loadSettings() {
    const message: MessageFromSidebar = {
      type: "GET_SETTINGS",
      payload: null,
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;

      if (response.type === "SETTINGS_RESPONSE") {
        this.currentSettings = response.payload;
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      this.showStatus("Error loading settings. Please check your configuration.", "error");
    }
  }

  private setupEventListeners() {
    this.sendButton.addEventListener("click", () => this.sendMessage());

    this.messageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    const settingsBtn = document.getElementById("settings-btn")!;
    settingsBtn.addEventListener("click", () => {
      browser.runtime.openOptionsPage();
    });

    const clearBtn = document.getElementById("clear-btn")!;
    clearBtn.addEventListener("click", () => {
      this.clearChat();
    });

    // Add test button handlers
    this.setupTestButtons();
  }

  private displayChatHistory() {
    const tabHistory = this.getTabChatHistory(this.currentSettings);
    
    if (tabHistory.length === 0) {
      // Only show welcome message if one doesn't already exist
      const existingWelcome = this.messagesContainer.querySelector('.welcome-message');
      if (!existingWelcome) {
        this.showWelcomeMessage();
      }
      return;
    }

    // Remove welcome message when we have chat history
    const welcomeMessage = this.messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    tabHistory.forEach((message) => {
      this.addMessageToUI(message);
    });

    this.scrollToBottom();
  }

  private async sendMessage() {
    const messageText = this.messageInput.value.trim();
    if (!messageText) return;

    if (!this.currentSettings) {
      this.showStatus("Please configure your settings first.", "error");
      return;
    }

    if (!this.currentSettings.provider.endpoint) {
      this.showStatus("Please configure your LLM provider in settings.", "error");
      return;
    }

    this.messageInput.value = "";
    this.sendButton.disabled = true;
    this.showStatus("Thinking...", "thinking");

    const welcomeMessage = this.messagesContainer.querySelector(".welcome-message");
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    const message: MessageFromSidebar = {
      type: "SEND_MESSAGE",
      payload: { message: messageText, tabId: this.tabId },
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;

      if (response.type === "MESSAGE_RESPONSE") {
        this.showStatus("");
        // Messages will be displayed via storage listener - no need to add directly
      } else if (response.type === "ERROR") {
        this.showStatus(`Error: ${response.payload.error}`, "error");
      }
    } catch (error) {
      console.error("Error sending message:", error);
      this.showStatus("Error sending message. Please try again.", "error");
    } finally {
      this.sendButton.disabled = false;
      this.messageInput.focus();
    }
  }

  private addMessageToUI(message: ChatMessage) {
    const messageElement = document.createElement("div");
    messageElement.className = `message ${message.role}`;

    const content = this.formatMessageContent(message.content);
    messageElement.innerHTML = content;

    this.messagesContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  private formatMessageContent(content: string): string {
    let formatted = content;

    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");

    formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");

    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");

    formatted = formatted.replace(/\n/g, "<br>");

    return formatted;
  }

  private scrollToBottom() {
    const container = this.messagesContainer.parentElement!;
    container.scrollTop = container.scrollHeight;
  }

  private showStatus(message: string, type?: "thinking" | "error") {
    this.statusElement.textContent = message;
    this.statusElement.className = `status ${type || ""}`;

    if (type === "error") {
      setTimeout(() => {
        this.statusElement.textContent = "";
        this.statusElement.className = "status";
      }, 5000);
    }
  }

  private setupTestButtons() {
    const testSummaryBtn = document.getElementById("test-summary");
    const testExtractBtn = document.getElementById("test-extract");
    const testFindBtn = document.getElementById("test-find");

    testSummaryBtn?.addEventListener("click", () => this.testFunction("summary", {}));
    testExtractBtn?.addEventListener("click", () => this.testFunction("extract", {}));
    testFindBtn?.addEventListener("click", () => this.testFunction("find", { pattern: "button|download|save", options: { limit: 5 } }));
  }

  private async testFunction(functionName: string, args: any) {
    this.showStatus(`Testing ${functionName}...`, "thinking");

    const message: MessageFromSidebar = {
      type: "EXECUTE_FUNCTION",
      payload: {
        function: functionName,
        arguments: args,
      },
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;

      if (response.type === "FUNCTION_RESPONSE") {
        const result = response.payload;
        if (result.success) {
          this.showStatus(`${functionName} completed successfully`);
          // Results are now automatically added to chat history via storage listener
        } else {
          this.showStatus(`${functionName} failed: ${result.error}`, "error");
        }
      } else if (response.type === "ERROR") {
        this.showStatus(`Error: ${response.payload.error}`, "error");
      }
    } catch (error) {
      console.error("Error testing function:", error);
      this.showStatus("Error testing function. Please try again.", "error");
    }
  }

  private setupStorageListener() {
    // Listen for storage changes to update chat history when LLMHelper functions are executed
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (this.isRefreshing) return; // Prevent recursive updates
      
      if (areaName === 'local' && changes.settings && changes.settings.newValue) {
        const newSettings = changes.settings.newValue as ExtensionSettings;
        
        // Get the current tab's chat history
        const currentTabHistory = this.getTabChatHistory(newSettings);
        
        // Only update if there are actually new messages
        if (currentTabHistory.length > this.lastDisplayedHistoryLength) {
          // Update current settings
          this.currentSettings = newSettings;
          
          // Add only the new messages to avoid flicker
          const newMessages = currentTabHistory.slice(this.lastDisplayedHistoryLength);
          this.addNewMessagesToUI(newMessages);
          
          this.lastDisplayedHistoryLength = currentTabHistory.length;
        } else if (currentTabHistory.length < this.lastDisplayedHistoryLength) {
          // History was cleared or reduced, do a full refresh
          this.currentSettings = newSettings;
          this.refreshChatDisplay();
        }
      }
    });
  }

  private addNewMessagesToUI(messages: ChatMessage[]): void {
    // Remove welcome message if present
    const welcomeMessage = this.messagesContainer.querySelector('.welcome-message');
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    // Add new messages
    messages.forEach((message) => {
      this.addMessageToUI(message);
    });
  }

  private refreshChatDisplay() {
    this.isRefreshing = true;
    
    // Clear current messages and redisplay the updated history
    this.clearUIMessages();
    
    this.displayChatHistory();
    
    // Update our tracking
    const currentHistory = this.getTabChatHistory(this.currentSettings);
    this.lastDisplayedHistoryLength = currentHistory.length;
    
    this.isRefreshing = false;
  }

  private async getCurrentTab(): Promise<void> {
    try {
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      this.tabId = tabs[0]?.id || null;
      
      // If we can't get the tab ID, try using a fallback approach
      if (!this.tabId) {
        // Use a default tab ID for testing or when tab info isn't available
        this.tabId = 1;
        console.warn('Could not get current tab ID, using fallback');
      }
    } catch (error) {
      console.error('Error getting current tab:', error);
      // Fallback to a default tab ID
      this.tabId = 1;
    }
  }

  private getTabChatHistory(settings: ExtensionSettings | null): ChatMessage[] {
    if (!settings) {
      return [];
    }
    
    if (!this.tabId) {
      return settings.chatHistory || [];
    }
    
    // Return tab-specific conversation or empty array for new tabs
    return settings.tabConversations?.[this.tabId.toString()] || [];
  }

  private async clearChat(): Promise<void> {
    if (!this.currentSettings) return;
    
    // Ensure we have a tab ID
    if (!this.tabId) {
      await this.getCurrentTab();
    }
    
    if (!this.tabId) {
      this.showStatus('Cannot clear chat: no tab information', 'error');
      return;
    }

    try {
      // Actually clear the conversation history for this tab
      const message: MessageFromSidebar = {
        type: "CLEAR_TAB_CONVERSATION",
        payload: { tabId: this.tabId },
      };

      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;
      
      if (response.type === "SETTINGS_RESPONSE") {
        // Update our local settings
        this.currentSettings = response.payload;
        this.lastDisplayedHistoryLength = 0;
        
        // Clear UI immediately
        this.clearUIMessages();
        this.showWelcomeMessage();
        
        this.showStatus('Chat cleared', '');
        setTimeout(() => this.showStatus('', ''), 2000);
      }
    } catch (error) {
      console.error('Error clearing chat:', error);
      this.showStatus('Error clearing chat', 'error');
    }
  }

  private clearUIMessages(): void {
    const messages = this.messagesContainer.querySelectorAll('.message');
    messages.forEach(msg => msg.remove());
    
    const existingWelcome = this.messagesContainer.querySelector('.welcome-message');
    if (existingWelcome) {
      existingWelcome.remove();
    }
  }

  private showWelcomeMessage(): void {
    // Check if welcome message already exists
    const existingWelcome = this.messagesContainer.querySelector('.welcome-message');
    if (existingWelcome) {
      return; // Don't add duplicate
    }
    
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'welcome-message';
    welcomeMessage.innerHTML = `
      <h3>Welcome to LLM Chat!</h3>
      <p>Start a conversation with your configured LLM. Make sure to configure your settings first.</p>
    `;
    this.messagesContainer.appendChild(welcomeMessage);
  }

  private setupTabChangeListener(): void {
    // Listen for active tab changes to update conversation context
    if (browser.tabs && browser.tabs.onActivated) {
      browser.tabs.onActivated.addListener(async (activeInfo) => {
        const previousTabId = this.tabId;
        this.tabId = activeInfo.tabId;
        
        // Only refresh if the tab actually changed
        if (previousTabId !== this.tabId) {
          await this.loadSettings(); // Reload settings to get latest data
          
          // Reset tracking for new tab
          this.lastDisplayedHistoryLength = 0;
          
          // Refresh display for new tab context
          this.refreshChatDisplay();
        }
      });
    }
  }

  private addTestResult(functionName: string, result: any) {
    // Test results are now handled by the storage listener
    // This method is kept for backwards compatibility but doesn't add UI messages directly
    console.log(`Test result for ${functionName}:`, result);
  }
}

new ChatInterface();
