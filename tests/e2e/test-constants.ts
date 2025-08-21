/**
 * Test constants and mock data for e2e tests
 */

export const mockLLMProvider = {
  endpoint: "http://localhost:1234/v1/chat/completions",
  model: "local-model",
  apiKey: "", // No API key for local models
};

export const testSettings = {
  openai: {
    endpoint: "https://api.openai.com/v1/chat/completions",
    model: "gpt-3.5-turbo",
    apiKey: "test-key-123",
  },
  lmstudio: {
    endpoint: "http://localhost:1234/v1/chat/completions",
    model: "local-model",
    apiKey: "",
  },
};
