export interface LLMProvider {
  name: string;
  endpoint: string;
  model: string;
  apiKey?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: number;
  tool_calls?: LLMToolCall[];
  tool_call_id?: string;
  isStreaming?: boolean;
  tool_results?: Array<{id: string, result: any, error?: string}>;
}

export interface LLMResponse {
  content: string;
  error?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

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
      }>;
      required?: string[];
    };
  };
}

export interface ExtensionSettings {
  provider: LLMProvider;
  chatHistory: ChatMessage[];
  debugMode: boolean;
  truncationLimit: number;
  tabConversations?: { [tabId: string]: ChatMessage[] };
  toolsEnabled: boolean;
}

export interface MessageFromSidebar {
  type: "SEND_MESSAGE" | "GET_SETTINGS" | "SAVE_SETTINGS" | "EXECUTE_FUNCTION" | "CLEAR_TAB_CONVERSATION";
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

export const DEFAULT_PROVIDERS: Omit<LLMProvider, "apiKey">[] = [
  {
    name: "LM Studio",
    endpoint: "http://localhost:1234/v1/chat/completions",
    model: "local-model",
  },
  {
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4",
  },
  {
    name: "Custom",
    endpoint: "",
    model: "",
  },
];
