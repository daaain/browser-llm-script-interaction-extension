export interface LLMProvider {
  name: string;
  endpoint: string;
  model: string;
  apiKey?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface LLMResponse {
  content: string;
  error?: string;
}

export interface ExtensionSettings {
  provider: LLMProvider;
  chatHistory: ChatMessage[];
  debugMode: boolean;
  truncationLimit: number;
}

export interface MessageFromSidebar {
  type: "SEND_MESSAGE" | "GET_SETTINGS" | "SAVE_SETTINGS" | "EXECUTE_FUNCTION";
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
