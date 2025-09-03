/**
 * Test constants and mock data for e2e tests
 */

// Timeout constants for different test scenarios
export const testTimeouts = {
  // For slower models like mlx-community/gpt-oss-120b
  SLOW_MODEL_STREAMING: 90000, // 90 seconds
  NORMAL_STREAMING: 30000, // 30 seconds
  TOOL_EXECUTION: 60000, // 60 seconds
  UI_INTERACTION: 10000, // 10 seconds
  SETTINGS_SAVE: 5000, // 5 seconds
} as const;

export const mockLLMProvider = {
  endpoint: 'http://localhost:1234/v1/chat/completions',
  model: 'local-model',
  apiKey: '', // No API key for local models
};

export const testSettings = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-3.5-turbo',
    apiKey: 'test-key-123',
  },
  lmstudio: {
    endpoint: 'http://localhost:1234/v1/chat/completions',
    model: 'local-model',
    apiKey: '',
  },
};
