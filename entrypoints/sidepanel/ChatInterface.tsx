import React, { useState, useEffect, useRef } from 'react';
import browser from 'webextension-polyfill';
import type {
  ChatMessage,
  ExtensionSettings,
  MessageFromSidebar,
  MessageToSidebar,
  MessageContent,
} from '~/utils/types';
import { sidepanelLogger } from '~/utils/debug-logger';

/**
 * React-based Chat Interface with AI SDK Integration
 * 
 * This component provides a modern React-based chat interface that can work with
 * both the AI SDK backend and the legacy backend, maintaining backwards compatibility
 * while providing a path to full AI SDK migration.
 */
const ChatInterface: React.FC = () => {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ text: string; type?: 'error' | 'thinking' }>({ text: '' });
  const [tabId, setTabId] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isRefreshingRef = useRef(false);

  // Initialize component
  useEffect(() => {
    initializeChat();
  }, []);


  // Set up storage listener for real-time updates
  useEffect(() => {
    const handleStorageChanges = (changes: any, areaName: string) => {
      if (isRefreshingRef.current) return;
      
      if (areaName === 'local' && changes.settings && changes.settings.newValue) {
        const newSettings = changes.settings.newValue as ExtensionSettings;
        setSettings(newSettings);
        
        // Update messages based on tab
        const tabHistory = getTabChatHistory(newSettings, tabId);
        setMessages(tabHistory);
      }
    };

    browser.storage.onChanged.addListener(handleStorageChanges);
    
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChanges);
    };
  }, [tabId]);

  // Set up tab change listener
  useEffect(() => {
    const handleTabChange = async (activeInfo: { tabId: number }) => {
      if (activeInfo.tabId !== tabId) {
        setTabId(activeInfo.tabId);
        // Don't call loadSettings here as it will be handled by the storage listener
      }
    };

    if (browser.tabs && browser.tabs.onActivated) {
      browser.tabs.onActivated.addListener(handleTabChange);
      return () => {
        browser.tabs.onActivated.removeListener(handleTabChange);
      };
    }
  }, [tabId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeChat = async () => {
    await getCurrentTab();
    await loadSettings();
  };

  const getCurrentTab = async (): Promise<void> => {
    try {
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const currentTabId = tabs[0]?.id || 1; // Use fallback if no tab ID
      setTabId(currentTabId);
    } catch (error) {
      console.error('Error getting current tab:', error);
      setTabId(1); // Fallback
    }
  };

  const loadSettings = async () => {
    sidepanelLogger.info('loadSettings starting...');
    
    const message: MessageFromSidebar = {
      type: 'GET_SETTINGS',
      payload: null,
    };

    try {
      sidepanelLogger.debug('Sending GET_SETTINGS request');
      const response = await browser.runtime.sendMessage(message) as MessageToSidebar;
      
      if (response.type === 'SETTINGS_RESPONSE') {
        const newSettings = response.payload;
        sidepanelLogger.debug('Settings received', { hasSettings: !!newSettings, hasTabConversations: !!newSettings?.tabConversations });
        setSettings(newSettings);
        
        // Update messages for current tab
        sidepanelLogger.debug('About to call getTabChatHistory', { tabId, newSettingsType: typeof newSettings });
        const tabHistory = getTabChatHistory(newSettings, tabId);
        sidepanelLogger.debug('Tab history loaded', { messageCount: tabHistory?.length || 0, isArray: Array.isArray(tabHistory) });
        setMessages(tabHistory);
      }
    } catch (error) {
      sidepanelLogger.error('Error in loadSettings', { error: error instanceof Error ? error.message : error });
      setStatus({ text: 'Error loading settings. Please check your configuration.', type: 'error' });
    }
  };

  const getTabChatHistory = (settings: ExtensionSettings | null, currentTabId: number | null): ChatMessage[] => {
    sidepanelLogger.debug('getTabChatHistory called', { hasSettings: !!settings, currentTabId, settingsType: typeof settings });
    
    if (!settings) {
      sidepanelLogger.debug('No settings, returning empty array');
      return [];
    }
    
    if (!currentTabId) {
      sidepanelLogger.debug('No tab ID, returning chatHistory', { chatHistoryLength: settings.chatHistory?.length || 0 });
      return settings.chatHistory || [];
    }
    
    const tabConversations = settings.tabConversations?.[currentTabId.toString()];
    sidepanelLogger.debug('Tab conversations lookup', { 
      hasTabConversations: !!settings.tabConversations, 
      tabKey: currentTabId.toString(),
      foundConversation: !!tabConversations,
      conversationLength: tabConversations?.length || 0
    });
    
    return tabConversations || [];
  };

  const sendMessage = async () => {
    sidepanelLogger.info('sendMessage called', { inputValue: inputValue.substring(0, 50) });
    
    const messageText = inputValue.trim();
    if (!messageText || isLoading) {
      sidepanelLogger.debug('sendMessage early return', { hasText: !!messageText, isLoading });
      return;
    }

    if (!settings?.provider?.endpoint) {
      sidepanelLogger.warn('No provider endpoint configured');
      setStatus({ text: 'Please configure your LLM provider in settings.', type: 'error' });
      return;
    }

    sidepanelLogger.debug('sendMessage proceeding', { messageText: messageText.substring(0, 50), hasSettings: !!settings });
    setInputValue('');
    setIsLoading(true);
    setStatus({ text: 'Thinking...', type: 'thinking' });

    const message: MessageFromSidebar = {
      type: 'SEND_MESSAGE',
      payload: { message: messageText, tabId },
    };

    try {
      sidepanelLogger.debug('About to send message to background script', { messageType: message.type });
      const response = await browser.runtime.sendMessage(message) as MessageToSidebar;
      sidepanelLogger.debug('Received response from background script', { responseType: response.type });

      if (response.type === 'MESSAGE_RESPONSE') {
        sidepanelLogger.info('Message response received successfully');
        setStatus({ text: '' });
        // Messages will be updated via storage listener
      } else if (response.type === 'ERROR') {
        sidepanelLogger.error('Error response received', { error: response.payload.error });
        setStatus({ text: `Error: ${response.payload.error}`, type: 'error' });
      }
    } catch (error) {
      sidepanelLogger.error('Exception in sendMessage', { error: error instanceof Error ? error.message : error });
      setStatus({ text: 'Error sending message. Please try again.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = async () => {
    if (!tabId) return;

    try {
      const message: MessageFromSidebar = {
        type: 'CLEAR_TAB_CONVERSATION',
        payload: { tabId },
      };

      const response = await browser.runtime.sendMessage(message) as MessageToSidebar;
      
      if (response.type === 'SETTINGS_RESPONSE') {
        setSettings(response.payload);
        setMessages([]);
        setStatus({ text: 'Chat cleared' });
        setTimeout(() => setStatus({ text: '' }), 2000);
      }
    } catch (error) {
      console.error('Error clearing chat:', error);
      setStatus({ text: 'Error clearing chat', type: 'error' });
    }
  };

  const openSettings = () => {
    browser.runtime.openOptionsPage();
  };

  const testFunction = async (functionName: string, args: any) => {
    setStatus({ text: `Testing ${functionName}...`, type: 'thinking' });

    const message: MessageFromSidebar = {
      type: 'EXECUTE_FUNCTION',
      payload: {
        function: functionName,
        arguments: args,
      },
    };

    try {
      const response = await browser.runtime.sendMessage(message) as MessageToSidebar;

      if (response.type === 'FUNCTION_RESPONSE') {
        const result = response.payload;
        if (result.success) {
          setStatus({ text: `${functionName} completed successfully` });
        } else {
          setStatus({ text: `${functionName} failed: ${result.error}`, type: 'error' });
        }
      } else if (response.type === 'ERROR') {
        setStatus({ text: `Error: ${response.payload.error}`, type: 'error' });
      }
    } catch (error) {
      console.error('Error testing function:', error);
      setStatus({ text: 'Error testing function. Please try again.', type: 'error' });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatMessageContent = (content: MessageContent): string => {
    if (!content) return '';
    
    if (typeof content === 'string') {
      return formatTextContent(content);
    }
    
    return content.map((item: any) => {
      if (item.type === 'text' && item.text) {
        return formatTextContent(item.text);
      } else if (item.type === 'input_image' && item.image_url) {
        return `<div class="screenshot-container">
          <img src="${item.image_url.url}" class="screenshot-thumbnail" style="cursor: pointer;">
        </div>`;
      }
      return '';
    }).join('');
  };

  const formatTextContent = (text: string): string => {
    let formatted = text;
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
  };

  const buildAssistantMessageHTML = (message: ChatMessage): string => {
    sidepanelLogger.debug('buildAssistantMessageHTML called', { messageId: message.id, hasContent: !!message.content });
    const contentParts: string[] = [];
    
    // Process AI SDK UI parts structure
    if ((message as any).parts && Array.isArray((message as any).parts)) {
      sidepanelLogger.debug('Processing message parts (AI SDK UI)', { partCount: (message as any).parts.length });
      
      for (const part of (message as any).parts) {
        switch (part.type) {
          case 'text':
            if (part.text && part.text.trim()) {
              contentParts.push(`<div class="assistant-text">${formatTextContent(part.text)}</div>`);
            }
            break;
            
          // Handle dynamic tool call types (e.g., 'tool-screenshot', 'tool-find', etc.)
          default:
            if (part.type.startsWith('tool-')) {
              const toolName = part.type.replace('tool-', '');
              const input = part.input || {};
              const state = part.state || 'input-streaming';
              
              switch (state) {
                case 'input-streaming':
                  contentParts.push(`<div class="tool-call">
                    <strong>🛠️ Calling:</strong><br>${toolName}(${JSON.stringify(input, null, 2)})
                  </div>`);
                  contentParts.push(`<div class="tool-result executing">
                    <strong>🔧 Tool Result:</strong>
                    <em>Executing...</em>
                  </div>`);
                  break;
                  
                case 'input-available':
                  contentParts.push(`<div class="tool-call">
                    <strong>🛠️ Calling:</strong><br>${toolName}(${JSON.stringify(input, null, 2)})
                  </div>`);
                  contentParts.push(`<div class="tool-result executing">
                    <strong>🔧 Tool Result:</strong>
                    <em>Executing...</em>
                  </div>`);
                  break;
                  
                case 'output-available':
                  contentParts.push(`<div class="tool-call">
                    <strong>🛠️ Calling:</strong><br>${toolName}(${JSON.stringify(input, null, 2)})
                  </div>`);
                  
                  if (part.output !== undefined) {
                    if (part.output?.type === 'screenshot' && part.output.dataUrl) {
                      contentParts.push(`<div class="tool-result">
                        <strong>🔧 Tool Result:</strong>
                        <div class="screenshot-container">
                          <img src="${part.output.dataUrl}" class="screenshot-thumbnail" style="cursor: pointer;">
                        </div>
                      </div>`);
                    } else {
                      contentParts.push(`<div class="tool-result">
                        <strong>🔧 Tool Result:</strong>
                        <pre><code>${JSON.stringify(part.output, null, 2)}</code></pre>
                      </div>`);
                    }
                  } else {
                    contentParts.push(`<div class="tool-result executing">
                      <strong>🔧 Tool Result:</strong>
                      <em>Executing...</em>
                    </div>`);
                  }
                  break;
                  
                case 'output-error':
                  contentParts.push(`<div class="tool-call">
                    <strong>🛠️ Calling:</strong><br>${toolName}(${JSON.stringify(input, null, 2)})
                  </div>`);
                  contentParts.push(`<div class="tool-result">
                    <strong>🔧 Tool Result:</strong>
                    <pre><code>Error: ${part.errorText || 'Unknown error'}</code></pre>
                  </div>`);
                  break;
              }
            } else {
              sidepanelLogger.warn('Unknown part type', { partType: part.type, part });
            }
            break;
        }
      }
    } else {
      // Fallback to plain text content if no parts
      const textContent = (message as any).currentStreamingText || message.content;
      if (textContent && (typeof textContent === 'string' ? textContent.trim() : textContent.length > 0)) {
        contentParts.push(`<div class="assistant-text">${formatMessageContent(textContent)}</div>`);
      }
    }
    
    return contentParts.join('');
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>LLM Chat</h1>
        <div className="header-buttons">
          <button onClick={clearChat} className="clear-btn" title="Clear Chat">🗑️</button>
          <button onClick={openSettings} className="settings-btn" title="Open Settings">⚙️</button>
        </div>
      </header>

      <div className="messages-container">
        <div id="messages" className="messages">
          {!messages || messages.length === 0 ? (
            <div className="welcome-message">
              <h3>Welcome to LLM Chat!</h3>
              <p>Start a conversation with your configured LLM. The assistant can now autonomously use browser automation tools when enabled in settings.</p>
              <p><strong>Available Tools:</strong> find elements, extract text, get page summary, describe sections, and clear references.</p>
            </div>
          ) : (
            (() => {
              sidepanelLogger.debug('Rendering messages', { 
                messageCount: messages?.length || 0, 
                isArray: Array.isArray(messages),
                messageTypes: (Array.isArray(messages) ? messages.filter(m => m).map(m => m.role) : [])
              });
              return (Array.isArray(messages) ? messages : [])
                .filter(message => {
                  if (!message) {
                    sidepanelLogger.warn('Found null/undefined message in filter');
                    return false;
                  }
                  return message.role !== 'tool';
                }) // Hide tool messages as they're integrated into assistant messages
              .map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.role} ${message.isStreaming ? 'streaming' : ''}`}
                >
                  {message.role === 'assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: buildAssistantMessageHTML(message) }} />
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: formatMessageContent(message.content) }} />
                  )}
                </div>
              ));
            })()
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>


      <div className="status-bar">
        <span id="status" className={`status ${status.type || ''}`}>{status.text}</span>
      </div>

      <div className="test-controls">
        <h4>Test LLMHelper Functions:</h4>
        <button onClick={() => testFunction('summary', {})} className="test-btn">Test Summary</button>
        <button onClick={() => testFunction('extract', {})} className="test-btn">Test Extract</button>
        <button onClick={() => testFunction('find', { pattern: 'button|download|save', options: { limit: 5 } })} className="test-btn">Test Find Buttons</button>
      </div>

      <div className="input-container">
        <textarea
          id="message-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyPress}
          className="message-input"
          placeholder="Type your message..."
          rows={2}
          disabled={isLoading}
        />
        <button
          id="send-btn"
          onClick={sendMessage}
          className="send-btn"
          disabled={isLoading || !inputValue.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;