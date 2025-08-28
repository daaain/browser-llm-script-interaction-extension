import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Storage } from 'webextension-polyfill';
import browser from 'webextension-polyfill';
import { toolDescriptions } from '~/utils/ai-tools';
import { sidepanelLogger } from '~/utils/debug-logger';
import type {
  ChatMessage,
  ExtensionSettings,
  MessageContent,
  MessageFromSidebar,
  MessageToSidebar,
} from '~/utils/types';
import { createStableId, isExtensionSettings } from '~/utils/types';
import ManualToolInterface from './ManualToolInterface';
import { MemoizedMarkdown } from './MemoizedMarkdown';

// Additional interfaces for AI SDK message parts
interface MessageContentItem {
  type: 'text' | 'input_image';
  text?: string;
  image_url?: {
    url: string;
  };
}

interface MessagePartBase {
  type: string;
  index?: number;
}

interface TextPart extends MessagePartBase {
  type: 'text';
  text?: string;
}

interface ToolPart extends MessagePartBase {
  type: string; // 'tool-{toolName}'
  input?: Record<string, unknown>;
  output?: {
    dataUrl?: string;
    result?: unknown;
    type?: string;
  };
  state?: 'input-streaming' | 'input-available' | 'output-available' | 'output-error';
  toolName?: string;
  errorText?: string;
}

type MessagePart = TextPart | ToolPart;

interface StreamingChatMessageWithParts extends ChatMessage {
  parts?: MessagePart[];
  currentStreamingText?: string;
}

// Component definitions moved outside for better performance
const MessageContentComponent: React.FC<{ content: MessageContent }> = ({ content }) => {
  if (!content) return null;

  if (typeof content === 'string') {
    return <MemoizedMarkdown content={content} id={createStableId('content', content)} />;
  }

  return (
    <>
      {content.map((item: MessageContentItem, index: number) => {
        if (item.type === 'text' && item.text) {
          return (
            <MemoizedMarkdown
              key={`text-${item.text.substring(0, 20)}-${index}`}
              content={item.text}
              id={createStableId('text', item.text, index)}
            />
          );
        } else if (item.type === 'input_image' && item.image_url) {
          return (
            <div
              key={`image-${item.image_url.url.substring(item.image_url.url.length - 10)}-${index}`}
              className="screenshot-container"
            >
              <img
                src={item.image_url.url}
                className="screenshot-thumbnail"
                style={{ cursor: 'pointer' }}
                alt="Screenshot"
              />
            </div>
          );
        }
        return null;
      })}
    </>
  );
};

const ToolCallDisplay: React.FC<{ toolName: string; part: ToolPart }> = ({ toolName, part }) => {
  const input = part.input || {};
  const state = part.state || 'input-streaming';

  const renderToolCall = () => (
    <div className="tool-call">
      <strong>🛠️ Calling:</strong>
      <br />
      {toolName}({JSON.stringify(input, null, 2)})
    </div>
  );

  const renderExecuting = () => (
    <div className="tool-result executing">
      <strong>🔧 Tool Result:</strong>
      <em>Executing...</em>
    </div>
  );

  const handleImageClick = (imageUrl: string) => {
    const newWindow = window.open();
    if (newWindow) {
      newWindow.document.body.innerHTML = `<img src="${imageUrl}" style="max-width:100%; max-height:100%;" alt="Screenshot"/>`;
    }
  };

  const handleImageKeyDown = (event: React.KeyboardEvent, imageUrl: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleImageClick(imageUrl);
    }
  };

  const renderResult = () => {
    // Handle screenshot output - check for dataUrl in various possible locations
    const hasScreenshotData =
      part.output?.dataUrl ||
      (part.output?.type === 'screenshot' && part.output.dataUrl) ||
      (part.toolName === 'screenshot' && part.output?.dataUrl);

    if (hasScreenshotData) {
      const imageUrl = part.output?.dataUrl || part.output?.dataUrl || '';
      return (
        <div className="tool-result">
          <strong>🔧 Tool Result:</strong>
          <div className="screenshot-container">
            <button
              type="button"
              className="screenshot-thumbnail"
              style={{
                cursor: 'pointer',
                maxWidth: '300px',
                maxHeight: '200px',
                border: '1px solid #ccc',
                background: 'none',
                padding: '0',
              }}
              onClick={() => handleImageClick(imageUrl)}
              onKeyDown={(event) => handleImageKeyDown(event, imageUrl)}
            >
              <img
                src={imageUrl}
                style={{
                  maxWidth: '100%',
                  maxHeight: '100%',
                }}
                alt="Screenshot"
              />
            </button>
          </div>
        </div>
      );
    } else {
      // Handle tool result display with proper JSON formatting
      let displayOutput = part.output;

      // If result is already an object, keep it as-is
      if (part.output && typeof part.output.result === 'object' && part.output.result !== null) {
        displayOutput = part.output;
      }
      // If result is a JSON string, try to parse it
      else if (part.output && typeof part.output.result === 'string') {
        try {
          const parsedResult = JSON.parse(part.output.result);
          // If it's an object, replace the string with the parsed object
          if (typeof parsedResult === 'object' && parsedResult !== null) {
            displayOutput = {
              ...part.output,
              result: parsedResult,
            };
          }
        } catch (_e) {
          // Not JSON, keep original output
          displayOutput = part.output;
        }
      }

      return (
        <div className="tool-result">
          <strong>🔧 Tool Result:</strong>
          <pre>
            <code>{JSON.stringify(displayOutput, null, 2)}</code>
          </pre>
        </div>
      );
    }
  };

  const renderError = () => (
    <div className="tool-result">
      <strong>🔧 Tool Result:</strong>
      <pre>
        <code>Error: {part.errorText || 'Unknown error'}</code>
      </pre>
    </div>
  );

  switch (state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <>
          {renderToolCall()}
          {renderExecuting()}
        </>
      );
    case 'output-available':
      return (
        <>
          {renderToolCall()}
          {part.output !== undefined ? renderResult() : renderExecuting()}
        </>
      );
    case 'output-error':
      return (
        <>
          {renderToolCall()}
          {renderError()}
        </>
      );
    default:
      return null;
  }
};

const MessagePart: React.FC<{ part: MessagePart; index: number }> = ({ part, index }) => {
  if (part.type === 'text') {
    const textPart = part as TextPart;
    if (textPart.text?.trim()) {
      return (
        <div key={index} className="assistant-text">
          <MemoizedMarkdown
            content={textPart.text}
            id={createStableId('part', textPart.text, index)}
          />
        </div>
      );
    }
    return null;
  }

  if (part.type === 'tool-call') {
    const toolPart = part as ToolPart;
    return <ToolCallDisplay key={index} toolName={toolPart.toolName ?? ''} part={toolPart} />;
  }

  console.warn('Unknown part type', { partType: part.type, part });
  return null;
};

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

  const getCurrentTab = useCallback(async (): Promise<void> => {
    try {
      const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      const currentTabId = tabs[0]?.id || 1; // Use fallback if no tab ID
      setTabId(currentTabId);
    } catch (error) {
      console.error('Error getting current tab:', error);
      setTabId(1); // Fallback
    }
  }, []);

  const getTabChatHistory = useCallback(
    (settings: ExtensionSettings | null, currentTabId: number | null): ChatMessage[] => {
      sidepanelLogger.debug('getTabChatHistory called', {
        hasSettings: !!settings,
        currentTabId,
        settingsType: typeof settings,
      });

      if (!settings) {
        sidepanelLogger.debug('No settings, returning empty array');
        return [];
      }

      if (!currentTabId) {
        sidepanelLogger.debug('No tab ID, returning chatHistory', {
          chatHistoryLength: settings.chatHistory?.length || 0,
        });
        return settings.chatHistory || [];
      }

      const tabConversations = settings.tabConversations?.[currentTabId.toString()];
      sidepanelLogger.debug('Tab conversations lookup', {
        hasTabConversations: !!settings.tabConversations,
        tabKey: currentTabId.toString(),
        foundConversation: !!tabConversations,
        conversationLength: tabConversations?.length || 0,
      });

      return tabConversations || [];
    },
    [],
  );

  const loadSettings = useCallback(async () => {
    sidepanelLogger.info('loadSettings starting...');

    const message: MessageFromSidebar = {
      type: 'GET_SETTINGS',
      payload: null,
    };

    try {
      sidepanelLogger.debug('Sending GET_SETTINGS request');
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;

      if (response.type === 'SETTINGS_RESPONSE') {
        const newSettings = response.payload as ExtensionSettings;
        sidepanelLogger.debug('Settings received', {
          hasSettings: !!newSettings,
          hasTabConversations: !!newSettings?.tabConversations,
        });
        setSettings(newSettings);

        // Update messages for current tab
        sidepanelLogger.debug('About to call getTabChatHistory', {
          tabId,
          newSettingsType: typeof newSettings,
        });
        const tabHistory = getTabChatHistory(newSettings, tabId);
        sidepanelLogger.debug('Tab history loaded', {
          messageCount: tabHistory?.length || 0,
          isArray: Array.isArray(tabHistory),
        });
        setMessages(tabHistory);
      }
    } catch (error) {
      sidepanelLogger.error('Error in loadSettings', {
        error: error instanceof Error ? error.message : error,
      });
      setStatus({
        text: 'Error loading settings. Please check your configuration.',
        type: 'error',
      });
    }
  }, [tabId, getTabChatHistory]);

  const initializeChat = useCallback(async () => {
    await getCurrentTab();
    await loadSettings();
  }, [getCurrentTab, loadSettings]);

  useEffect(() => {
    initializeChat();
  }, [initializeChat]);

  // Set up storage listener for real-time updates
  useEffect(() => {
    const handleStorageChanges = (
      changes: Storage.StorageAreaOnChangedChangesType,
      areaName: string,
    ) => {
      if (isRefreshingRef.current) return;

      if (areaName === 'local' && changes.settings && changes.settings.newValue) {
        // Validate settings before using them
        if (!isExtensionSettings(changes.settings.newValue)) {
          console.warn('Invalid settings received from storage, ignoring');
          return;
        }

        const newSettings = changes.settings.newValue;
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
  }, [tabId, getTabChatHistory]);

  // Set up tab change listener
  useEffect(() => {
    const handleTabChange = async (activeInfo: { tabId: number }) => {
      if (activeInfo.tabId !== tabId) {
        setTabId(activeInfo.tabId);
        // Don't call loadSettings here as it will be handled by the storage listener
      }
    };

    if (browser.tabs?.onActivated) {
      browser.tabs.onActivated.addListener(handleTabChange);
      return () => {
        browser.tabs.onActivated.removeListener(handleTabChange);
      };
    }
  }, [tabId]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  // Auto-scroll to bottom when messages change
  // biome-ignore lint/correctness/useExhaustiveDependencies: we need to use messages to know when to scroll
  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom, messages]);

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

    sidepanelLogger.debug('sendMessage proceeding', {
      messageText: messageText.substring(0, 50),
      hasSettings: !!settings,
    });
    setInputValue('');
    setIsLoading(true);
    setStatus({ text: 'Thinking...', type: 'thinking' });

    const message: MessageFromSidebar = {
      type: 'SEND_MESSAGE',
      payload: { message: messageText, tabId: tabId ?? undefined },
    };

    try {
      sidepanelLogger.debug('About to send message to background script', {
        messageType: message.type,
      });
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;
      sidepanelLogger.debug('Received response from background script', {
        responseType: response.type,
      });

      if (response.type === 'MESSAGE_RESPONSE') {
        sidepanelLogger.info('Message response received successfully');
        setStatus({ text: '' });
        // Messages will be updated via storage listener
      } else if (response.type === 'ERROR') {
        const errorPayload = response.payload as { error: string };
        sidepanelLogger.error('Error response received', { error: errorPayload.error });
        setStatus({ text: `Error: ${errorPayload.error}`, type: 'error' });
      }
    } catch (error) {
      sidepanelLogger.error('Exception in sendMessage', {
        error: error instanceof Error ? error.message : error,
      });
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

      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;

      if (response.type === 'SETTINGS_RESPONSE') {
        setSettings(response.payload as ExtensionSettings);
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

  const testFunction = async (functionName: string, args: Record<string, unknown>) => {
    setStatus({ text: `Testing ${functionName}...`, type: 'thinking' });

    const message: MessageFromSidebar = {
      type: 'EXECUTE_FUNCTION',
      payload: {
        function: functionName,
        arguments: args,
      },
    };

    try {
      const response = (await browser.runtime.sendMessage(message)) as MessageToSidebar;

      if (response.type === 'FUNCTION_RESPONSE') {
        const result = response.payload as { success: boolean; error?: string };
        if (result.success) {
          setStatus({
            text: `${functionName} completed successfully! Results:\n${JSON.stringify(response.payload)}`,
          });
        } else {
          setStatus({ text: `${functionName} failed: ${result.error}`, type: 'error' });
        }
      } else if (response.type === 'ERROR') {
        const errorPayload = response.payload as { error: string };
        setStatus({ text: `Error: ${errorPayload.error}`, type: 'error' });
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

  const renderAssistantMessage = (message: ChatMessage) => {
    sidepanelLogger.debug('renderAssistantMessage called', {
      messageId: message.id,
      hasContent: !!message.content,
    });

    // Process AI SDK UI parts structure
    const messageWithParts = message as StreamingChatMessageWithParts;
    if (messageWithParts.parts && Array.isArray(messageWithParts.parts)) {
      sidepanelLogger.debug('Processing message parts (AI SDK UI)', {
        partCount: messageWithParts.parts.length,
      });

      return (
        <div className="assistant-message">
          {messageWithParts.parts.map((part: MessagePart, index: number) => (
            <MessagePart key={`part-${index}-${part.type}`} part={part} index={index} />
          ))}
        </div>
      );
    } else {
      // Fallback to plain text content if no parts
      const textContent = messageWithParts.currentStreamingText || message.content;
      if (
        textContent &&
        (typeof textContent === 'string' ? textContent.trim() : textContent.length > 0)
      ) {
        return (
          <div className="assistant-text">
            <MessageContentComponent content={textContent} />
          </div>
        );
      }
      return null;
    }
  };

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>LLM Chat</h1>
        <div className="header-buttons">
          <button
            type="button"
            id="clear-btn"
            onClick={clearChat}
            className="clear-btn"
            title="Clear Chat"
          >
            🗑️
          </button>
          <button
            type="button"
            id="settings-btn"
            onClick={openSettings}
            className="settings-btn"
            title="Open Settings"
          >
            ⚙️
          </button>
        </div>
      </header>

      <div className="messages-container">
        <div id="messages" className="messages">
          {!messages || messages.length === 0 ? (
            <div className="welcome-message">
              <h3>Welcome to LLM Actions!</h3>
              <p>
                Start a conversation with your configured LLM. The assistant can now autonomously
                use browser automation tools when enabled in settings.
              </p>
              <p>
                <strong>Available Tools:</strong> {Object.values(toolDescriptions).join(', ')}.
              </p>
            </div>
          ) : (
            (() => {
              sidepanelLogger.debug('Rendering messages', {
                messageCount: messages?.length || 0,
                isArray: Array.isArray(messages),
                messageTypes: Array.isArray(messages)
                  ? messages.filter((m) => m).map((m) => m.role)
                  : [],
              });
              return (Array.isArray(messages) ? messages : [])
                .filter((message) => {
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
                      renderAssistantMessage(message)
                    ) : (
                      <MessageContentComponent content={message.content} />
                    )}
                  </div>
                ));
            })()
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <div className="status-bar">
        <span id="status" className={`status ${status.type || ''}`}>
          {status.text}
        </span>
      </div>

      <ManualToolInterface onExecuteTool={testFunction} isExecuting={isLoading} />

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
          type="button"
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
