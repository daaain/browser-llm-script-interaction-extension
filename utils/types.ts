export interface LLMProvider {
  name: string;
  endpoint: string;
  model: string;
  apiKey?: string;
}

export type MessageContent = string | Array<{
  type: "text" | "input_image";
  text?: string;
  image_url?: {
    url: string;
  };
}>;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: MessageContent;
  timestamp: number;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  isStreaming?: boolean;
  tool_results?: Array<{id: string, result: any, error?: string}>;
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
  result: any;
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
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description?: string;
        enum?: string[];
        properties?: Record<string, {
          type: string;
          description?: string;
          enum?: string[];
        }>;
      }>;
      required?: string[];
    };
  };
}


export interface MessageFromSidebar {
  type: "SEND_MESSAGE" | "GET_SETTINGS" | "SAVE_SETTINGS" | "EXECUTE_FUNCTION" | "CLEAR_TAB_CONVERSATION" | "CAPTURE_SCREENSHOT";
  payload: any;
}

export interface MessageToSidebar {
  type: "MESSAGE_RESPONSE" | "SETTINGS_RESPONSE" | "ERROR" | "FUNCTION_RESPONSE";
  payload: any;
}

export interface ContentScriptFunctionRequest {
  type: "EXECUTE_FUNCTION";
  function: string;
  arguments: any;
}

export interface ContentScriptFunctionResponse {
  success: boolean;
  result?: any;
  error?: string;
}

// Re-export AI SDK types for use throughout the application
export type { 
  UIMessage,
  ModelMessage, 
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ImagePart,
  FilePart
} from 'ai';

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

// Extended types for AI SDK integration
// ExtendedUIMessage removed - using ChatMessage instead

// Migration support - indicates which message format to use
export interface MigrationConfig {
  useAISDK: boolean;
  enableBackwardsCompatibility: boolean;
}

// Updated ExtensionSettings to support both message formats
export interface ExtensionSettings {
  provider: LLMProvider;
  chatHistory: ChatMessage[];
  debugMode: boolean;
  truncationLimit: number;
  tabConversations?: { [tabId: string]: ChatMessage[] };
  toolsEnabled: boolean;
  // Migration settings
  migrationConfig?: MigrationConfig;
  // AI SDK specific settings
  aiSDKSettings?: {
    enableStreaming: boolean;
    maxToolRounds: number;
    temperature?: number;
    maxTokens?: number;
  };
}

export const DEFAULT_PROVIDERS: Omit<LLMProvider, "apiKey">[] = [
  {
    name: "LM Studio",
    endpoint: "http://localhost:1234/v1/chat/completions",
    model: "local-model",
  },
  {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o",
  },
  {
    name: "Anthropic Claude (via OpenRouter)",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    model: "anthropic/claude-3.5-sonnet",
  },
  {
    name: "Custom",
    endpoint: "",
    model: "",
  },
];

// Default migration configuration
export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
  useAISDK: true, // Enable AI SDK by default for new installations
  enableBackwardsCompatibility: true, // Support reading old message formats
};

// Default AI SDK settings
export const DEFAULT_AI_SDK_SETTINGS = {
  enableStreaming: true,
  maxToolRounds: 10,
  temperature: 0.7,
  maxTokens: 4096,
};
