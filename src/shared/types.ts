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
}

export interface MessageFromSidebar {
  type: "SEND_MESSAGE" | "GET_SETTINGS" | "SAVE_SETTINGS";
  payload: any;
}

export interface MessageToSidebar {
  type: "MESSAGE_RESPONSE" | "SETTINGS_RESPONSE" | "ERROR";
  payload: any;
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
