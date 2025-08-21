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

  constructor() {
    this.messagesContainer = document.getElementById("messages")!;
    this.messageInput = document.getElementById("message-input") as HTMLTextAreaElement;
    this.sendButton = document.getElementById("send-btn") as HTMLButtonElement;
    this.statusElement = document.getElementById("status")!;

    this.init();
  }

  private async init() {
    await this.loadSettings();
    this.setupEventListeners();
    this.displayChatHistory();
    this.setupStorageListener();
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

    // Add test button handlers
    this.setupTestButtons();
  }

  private displayChatHistory() {
    if (!this.currentSettings || this.currentSettings.chatHistory.length === 0) {
      return;
    }

    const welcomeMessage = this.messagesContainer.querySelector(".welcome-message");
    if (welcomeMessage) {
      welcomeMessage.remove();
    }

    this.currentSettings.chatHistory.forEach((message) => {
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

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: Date.now(),
    };

    this.addMessageToUI(userMessage);

    const message: MessageFromSidebar = {
      type: "SEND_MESSAGE",
      payload: { message: messageText },
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;

      if (response.type === "MESSAGE_RESPONSE") {
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: response.payload.content,
          timestamp: Date.now(),
        };

        this.addMessageToUI(assistantMessage);
        this.showStatus("");
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
      if (areaName === 'local' && changes.settings && changes.settings.newValue) {
        const newSettings = changes.settings.newValue as ExtensionSettings;
        const oldSettings = changes.settings.oldValue as ExtensionSettings;
        
        // Check if chat history has been updated
        if (newSettings.chatHistory.length > (oldSettings?.chatHistory?.length || 0)) {
          // Update current settings and refresh chat display
          this.currentSettings = newSettings;
          this.refreshChatDisplay();
        }
      }
    });
  }

  private refreshChatDisplay() {
    // Clear current messages and redisplay the updated history
    const messages = this.messagesContainer.querySelectorAll('.message');
    messages.forEach(msg => msg.remove());
    
    // Remove welcome message if it exists
    const welcomeMessage = this.messagesContainer.querySelector(".welcome-message");
    if (welcomeMessage) {
      welcomeMessage.remove();
    }
    
    this.displayChatHistory();
  }

  private addTestResult(functionName: string, result: any) {
    // Test results are now handled by the storage listener
    // This method is kept for backwards compatibility but doesn't add UI messages directly
    console.log(`Test result for ${functionName}:`, result);
  }
}

new ChatInterface();
