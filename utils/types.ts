export interface LLMProvider {
  name: string;
  endpoint: string;
  model: string;
  apiKey?: string;
}

export type MessageContent =
  | string
  | Array<{
      type: 'text' | 'input_image';
      text?: string;
      image_url?: {
        url: string;
      };
    }>;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: MessageContent;
  timestamp: number;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  isStreaming?: boolean;
  tool_results?: ToolResult[];
  parentMessageId?: string;
  toolRound?: number;
}

export interface StreamingChatMessage extends ChatMessage {
  contentSegments?: string[];
  currentStreamingText?: string;
  streamingText?: string;
}

export interface ToolResult {
  id: string;
  result: unknown;
  error?: string;
}

export interface LLMResponse {
  content: MessageContent;
  error?: string;
  tool_calls?: LLMToolCall[];
}

// Use AI SDK tool call format only
export type LLMToolCall = AISDKToolCall;

export interface LLMTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<
        string,
        {
          type: string;
          description?: string;
          enum?: string[];
          properties?: Record<
            string,
            {
              type: string;
              description?: string;
              enum?: string[];
            }
          >;
        }
      >;
      required?: string[];
    };
  };
}

// Message payload types for type safety
export interface SendMessagePayload {
  message: string;
  tabId?: number;
}

export interface SaveSettingsPayload {
  settings: ExtensionSettings;
}

export interface ExecuteFunctionPayload {
  function: string;
  arguments: Record<string, unknown>;
}

export interface ClearTabConversationPayload {
  tabId: number;
}

export interface GetResponsePagePayload {
  responseId: string;
  page: number;
}

export interface MessageResponsePayload {
  content: string;
}

export interface ErrorPayload {
  error: string;
  success?: false;
}

export interface FunctionResponsePayload {
  success: boolean;
  result?: unknown;
  error?: string;
  dataUrl?: string;
}

export interface TestConnectionResponsePayload {
  success: boolean;
  error?: string;
}

export interface ResponsePagePayload {
  success: boolean;
  result: string;
  _meta: {
    isTruncated: boolean;
    originalLength: number;
    currentPage: number;
    totalPages: number;
    hasMore: boolean;
    hasPrevious: boolean;
    responseId: string;
  };
}

// Discriminated union types for messages
export type MessageFromSidebar =
  | { type: 'SEND_MESSAGE'; payload: SendMessagePayload }
  | { type: 'GET_SETTINGS'; payload: null }
  | { type: 'SAVE_SETTINGS'; payload: ExtensionSettings }
  | { type: 'EXECUTE_FUNCTION'; payload: ExecuteFunctionPayload }
  | { type: 'CLEAR_TAB_CONVERSATION'; payload: ClearTabConversationPayload }
  | { type: 'CAPTURE_SCREENSHOT'; payload: null }
  | { type: 'TEST_CONNECTION'; payload: null }
  | { type: 'GET_RESPONSE_PAGE'; payload: GetResponsePagePayload };

export type MessageToSidebar =
  | { type: 'MESSAGE_RESPONSE'; payload: MessageResponsePayload }
  | { type: 'SETTINGS_RESPONSE'; payload: ExtensionSettings | { success: boolean } }
  | { type: 'ERROR'; payload: ErrorPayload }
  | { type: 'FUNCTION_RESPONSE'; payload: FunctionResponsePayload }
  | { type: 'TEST_CONNECTION_RESPONSE'; payload: TestConnectionResponsePayload }
  | { type: 'RESPONSE_PAGE'; payload: ResponsePagePayload };

export interface ContentScriptFunctionRequest {
  type: 'EXECUTE_FUNCTION';
  function: string;
  arguments: Record<string, unknown>;
}

export interface ContentScriptFunctionResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

// AI SDK tool call structure (based on internal AI SDK types)
export interface AISDKToolCall {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
  dynamic?: boolean;
  invalid?: boolean;
  error?: unknown;
}

// Extended part types with state tracking for UI
export interface ExtendedTextPart {
  type: 'text';
  text: string;
}

export interface ExtendedToolCallPart {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  input: unknown;
  state?: 'input-available' | 'output-available' | 'output-error';
  output?: unknown;
  errorText?: string;
}

export interface ExtendedToolResultPart {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  output: unknown;
  state?: 'output-available' | 'output-error';
  errorText?: string;
}

export type ExtendedPart = ExtendedTextPart | ExtendedToolCallPart | ExtendedToolResultPart;

// Updated ExtensionSettings to support both message formats
export interface ExtensionSettings {
  provider: LLMProvider;
  chatHistory: ChatMessage[];
  debugMode: boolean;
  truncationLimit: number;
  tabConversations?: { [tabId: string]: ChatMessage[] };
  toolsEnabled: boolean;
  screenshotToolEnabled: boolean;
  maxLogEntries: number;
}

// Chrome-specific sidePanel API types
export interface ChromeSidePanel {
  setPanelBehavior(options: { openPanelOnActionClick: boolean }): Promise<void>;
}

// Extended browser interface for Chrome-specific APIs
export interface ExtendedBrowser {
  sidePanel?: ChromeSidePanel;
}

export const DEFAULT_PROVIDERS: Omit<LLMProvider, 'apiKey'>[] = [
  {
    name: 'LM Studio',
    endpoint: 'http://localhost:1234/v1/chat/completions',
    model: 'local-model',
  },
  {
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o',
  },
  {
    name: 'Anthropic Claude (via OpenRouter)',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'anthropic/claude-3.5-sonnet',
  },
  {
    name: 'Custom',
    endpoint: '',
    model: '',
  },
];

// Type guard functions
export function isMessageFromSidebar(message: unknown): message is MessageFromSidebar {
  if (!message || typeof message !== 'object') return false;
  const msg = message as Record<string, unknown>;
  return (
    typeof msg.type === 'string' &&
    [
      'SEND_MESSAGE',
      'GET_SETTINGS',
      'SAVE_SETTINGS',
      'EXECUTE_FUNCTION',
      'CLEAR_TAB_CONVERSATION',
      'CAPTURE_SCREENSHOT',
      'TEST_CONNECTION',
      'GET_RESPONSE_PAGE',
    ].includes(msg.type)
  );
}

export function isExtensionSettings(value: unknown): value is ExtensionSettings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (
    settings.provider !== undefined &&
    Array.isArray(settings.chatHistory) &&
    typeof settings.debugMode === 'boolean' &&
    typeof settings.truncationLimit === 'number' &&
    typeof settings.toolsEnabled === 'boolean' &&
    typeof settings.screenshotToolEnabled === 'boolean'
  );
}

// Utility for creating stable, deterministic IDs based on content
export function createStableId(prefix: string, content: string, index?: number): string {
  // Bound content to first and last 500 chars for performance
  const boundedContent =
    content.length > 1000 ? content.slice(0, 500) + content.slice(-500) : content;

  // Hash using reduce for cleaner implementation
  const hash = Array.from(boundedContent).reduce((acc, char) => {
    return ((acc << 5) - acc + char.charCodeAt(0)) & 0xffffffff;
  }, 0);

  const suffix = index !== undefined ? `-${index}` : '';
  return `${prefix}-${Math.abs(hash)}${suffix}`;
}
