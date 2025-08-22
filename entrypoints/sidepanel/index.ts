import browser from "webextension-polyfill";
import type {
  ChatMessage,
  ExtensionSettings,
  MessageFromSidebar,
  MessageToSidebar,
  MessageContent,
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
        // Messages will be displayed via storage listener
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
    // Check if message already exists and update it
    const existingElement = this.messagesContainer.querySelector(`[data-message-id="${message.id}"]`);
    if (existingElement) {
      this.updateMessageElement(existingElement as HTMLElement, message);
      return;
    }

    const messageElement = document.createElement("div");
    messageElement.className = `message ${message.role}`;
    messageElement.dataset.messageId = message.id;

    this.updateMessageElement(messageElement, message);
    this.messagesContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  private updateMessageElement(messageElement: HTMLElement, message: ChatMessage) {
    // Add or remove streaming class
    if (message.isStreaming) {
      messageElement.classList.add("streaming");
    } else {
      messageElement.classList.remove("streaming");
    }
    
    // Handle different message types
    if (message.role === "tool") {
      // Hide tool messages as they're now integrated into assistant messages
      messageElement.style.display = 'none';
      return;
    } else if (message.role === "assistant") {
      this.updateAssistantMessage(messageElement, message);
    } else {
      // For user messages, update content directly
      const formattedContent = this.formatMessageContent(message.content);
      if (messageElement.innerHTML !== formattedContent) {
        messageElement.innerHTML = formattedContent;
      }
    }
    
    this.scrollToBottom();
  }

  private updateAssistantMessage(messageElement: HTMLElement, message: ChatMessage) {
    // For streaming messages, handle incremental updates more carefully
    if (message.isStreaming) {
      this.updateStreamingMessage(messageElement, message);
    } else {
      // For non-streaming messages, rebuild completely
      const contentHTML = this.buildAssistantMessageHTML(message);
      if (messageElement.innerHTML !== contentHTML) {
        messageElement.innerHTML = contentHTML;
      }
    }
  }

  private updateStreamingMessage(messageElement: HTMLElement, message: ChatMessage) {
    // For streaming messages, we need to carefully update different parts
    const existingContent = messageElement.innerHTML;
    const newContent = this.buildAssistantMessageHTML(message);
    
    // Only update if the content has actually changed to avoid DOM thrashing
    if (existingContent !== newContent) {
      // Check if we're just updating text content in an existing structure
      if (this.canUpdateTextContentOnly(messageElement, message)) {
        // Use streamingText during streaming if available
        const textContent = message.isStreaming && (message as any).streamingText 
          ? (message as any).streamingText 
          : message.content;
        this.updateExistingTextContent(messageElement, textContent);
      } else {
        // Full rebuild needed (e.g., tool calls/results added)
        messageElement.innerHTML = newContent;
      }
    }
  }

  private canUpdateTextContentOnly(messageElement: HTMLElement, message: ChatMessage): boolean {
    // Only do incremental text updates if:
    // 1. We already have some structure
    // 2. No new tool calls since last update
    // 3. No new tool results since last update
    
    const hasExistingStructure = messageElement.children.length > 0;
    if (!hasExistingStructure) return false;
    
    // Check if structure matches current message
    const existingToolCalls = messageElement.querySelectorAll('.tool-call').length;
    const existingToolResults = messageElement.querySelectorAll('.tool-result').length;
    const currentToolCalls = message.tool_calls?.length || 0;
    const currentToolResults = message.tool_results?.length || 0;
    
    // Only do incremental update if tool structure hasn't changed
    return existingToolCalls === currentToolCalls && existingToolResults === currentToolResults;
  }

  private buildAssistantMessageHTML(message: ChatMessage): string {
    const contentParts: string[] = [];
    
    // Interleave tool calls with their corresponding results
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        // Add the tool call
        const toolCallHtml = `<div class="tool-call">
          <strong>🛠️ Calling:</strong><br>${toolCall.function.name}(${this.formatToolArguments(toolCall.function.arguments)})
        </div>`;
        contentParts.push(toolCallHtml);
        
        // Find the corresponding tool result
        const toolResult = message.tool_results?.find(tr => tr.id === toolCall.id);
        
        let toolResultHtml = "";
        if (toolResult) {
          if (toolResult.error) {
            toolResultHtml = `<div class="tool-result">
              <strong>🔧 Tool Result:</strong>
              <pre><code>Error: ${toolResult.error}</code></pre>
            </div>`;
          } else if (toolResult.result && typeof toolResult.result === 'object' && toolResult.result.type === 'screenshot' && toolResult.result.dataUrl) {
            // Handle screenshot results specially
            toolResultHtml = `<div class="tool-result">
              <strong>🔧 Tool Result:</strong>
              ${this.formatImageContent(toolResult.result.dataUrl)}
            </div>`;
          } else {
            // Regular tool results
            toolResultHtml = `<div class="tool-result">
              <strong>🔧 Tool Result:</strong>
              <pre><code>${this.formatToolResult(JSON.stringify(toolResult.result))}</code></pre>
            </div>`;
          }
        } else {
          // If no result found yet, show a placeholder (for streaming scenarios)
          toolResultHtml = `<div class="tool-result executing">
            <strong>🔧 Tool Result:</strong>
            <em>Executing...</em>
          </div>`;
        }
        
        contentParts.push(toolResultHtml);
      }
    }
    
    // Add assistant text content at the end
    // During streaming, use streamingText if available, otherwise use content
    const textContent = message.isStreaming && (message as any).streamingText 
      ? (message as any).streamingText 
      : message.content;
      
    if (textContent && (typeof textContent === 'string' ? textContent.trim() : textContent.length > 0)) {
      const textHtml = `<div class="assistant-text">
        ${this.formatMessageContent(textContent)}
      </div>`;
      contentParts.push(textHtml);
    }
    
    return contentParts.join('');
  }

  private updateExistingTextContent(messageElement: HTMLElement, content: any) {
    let textContainer = messageElement.querySelector('.assistant-text') as HTMLElement;
    
    // Create text container if it doesn't exist and we have content
    if (!textContainer && content && (typeof content === 'string' ? content.trim() : content.length > 0)) {
      textContainer = document.createElement('div');
      textContainer.className = 'assistant-text';
      messageElement.appendChild(textContainer);
    }
    
    if (!textContainer) return;
    
    // Update text content incrementally for streaming effect
    if (content && (typeof content === 'string' ? content.trim() : content.length > 0)) {
      const formattedContent = this.formatMessageContent(content);
      const currentContent = textContainer.innerHTML;
      
      // For streaming, only update if content has grown (avoid flashing)
      if (formattedContent !== currentContent && formattedContent.length >= currentContent.length) {
        textContainer.innerHTML = formattedContent;
      }
    } else {
      // Clear text content if empty
      if (textContainer.innerHTML !== '') {
        textContainer.innerHTML = '';
      }
    }
  }

  private formatMessageContent(content: MessageContent): string {
    if (!content) return "";
    
    // Handle string content (legacy format)
    if (typeof content === 'string') {
      return this.formatTextContent(content);
    }
    
    // Handle multimodal content array
    return content.map((item: { type: string; text?: string; image_url?: { url: string } }) => {
      if (item.type === 'text' && item.text) {
        return this.formatTextContent(item.text);
      } else if (item.type === 'input_image' && item.image_url) {
        return this.formatImageContent(item.image_url.url);
      }
      return '';
    }).join('');
  }
  
  private formatTextContent(text: string): string {
    let formatted = text;

    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>");
    formatted = formatted.replace(/`([^`]+)`/g, "<code>$1</code>");
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    formatted = formatted.replace(/\*(.*?)\*/g, "<em>$1</em>");
    formatted = formatted.replace(/\n/g, "<br>");

    return formatted;
  }
  
  private formatImageContent(imageUrl: string): string {
    return `<div class="screenshot-container">
      <img src="${imageUrl}" class="screenshot-thumbnail" style="cursor: pointer;">
    </div>`;
  }
  
  private formatToolArguments(argumentsString: string): string {
    try {
      const args = JSON.parse(argumentsString);
      return JSON.stringify(args, null, 2);
    } catch {
      return argumentsString;
    }
  }
  
  private formatToolResult(result: string): string {
    try {
      const parsed = JSON.parse(result);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return result;
    }
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
        
        // Update current settings
        this.currentSettings = newSettings;
        
        if (currentTabHistory.length > this.lastDisplayedHistoryLength) {
          // Add only the new messages to avoid flicker
          const newMessages = currentTabHistory.slice(this.lastDisplayedHistoryLength);
          this.addNewMessagesToUI(newMessages);
          this.lastDisplayedHistoryLength = currentTabHistory.length;
        } else if (currentTabHistory.length < this.lastDisplayedHistoryLength) {
          // History was cleared or reduced, do a full refresh
          this.refreshChatDisplay();
        } else if (currentTabHistory.length === this.lastDisplayedHistoryLength) {
          // Same number of messages but content might have changed (streaming updates)
          // Update all existing messages that might have changed
          this.updateExistingMessages(currentTabHistory);
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
    
    // Add new messages (filter out tool messages as they're integrated into assistant messages)
    messages.forEach((message) => {
      if (message.role !== "tool") {
        this.addMessageToUI(message);
      }
    });
  }

  private updateExistingMessages(messages: ChatMessage[]): void {
    // Update all existing messages that might have changed content
    messages.forEach((message) => {
      if (message.role !== "tool") {
        const existingElement = this.messagesContainer.querySelector(`[data-message-id="${message.id}"]`);
        if (existingElement) {
          this.updateMessageElement(existingElement as HTMLElement, message);
        }
      }
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
        
        this.showStatus('Chat cleared');
        setTimeout(() => this.showStatus(''), 2000);
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
      <p>Start a conversation with your configured LLM. The assistant can now autonomously use browser automation tools when enabled in settings.</p>
      <p><strong>Available Tools:</strong> find elements, extract text, get page summary, describe sections, and clear references.</p>
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
}

new ChatInterface();
