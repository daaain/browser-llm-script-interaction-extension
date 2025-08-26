import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LLMService } from '../../utils/llm-service';
import type { ChatMessage, LLMProvider } from '../../utils/types';

// Mock the AI SDK
vi.mock('ai', () => ({
  streamText: vi.fn(),
  convertToModelMessages: vi.fn((messages) => messages),
  stepCountIs: vi.fn(),
}));

// Mock available tools
vi.mock('../../utils/ai-tools', () => ({
  availableTools: [],
}));

// Mock background logger
vi.mock('../../utils/debug-logger', () => ({
  backgroundLogger: {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('LLMService', () => {
  let llmService: LLMService;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    mockProvider = {
      name: 'Test Provider',
      endpoint: 'http://localhost:1234/v1/chat/completions',
      model: 'test-model',
      apiKey: 'test-key',
    };

    llmService = new LLMService(mockProvider);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('streamMessage', () => {
    it('should call streamMessage with correct parameters', async () => {
      const { streamText } = await import('ai');
      const mockMessages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
      ];

      const mockOnChunk = vi.fn();
      const mockOnComplete = vi.fn();
      const mockOnError = vi.fn();

      // Mock streamText to simulate successful streaming
      const mockTextStream = {
        async *[Symbol.asyncIterator]() {
          yield 'Hello! ';
          yield 'How can ';
          yield 'I help you?';
        },
      };

      const mockResult = {
        textStream: mockTextStream,
        text: Promise.resolve('Hello! How can I help you?'),
        finishReason: Promise.resolve('stop'),
        usage: Promise.resolve({ promptTokens: 10, completionTokens: 20 }),
        response: Promise.resolve({}),
      };

      (streamText as any).mockReturnValue(mockResult);

      await llmService.streamMessage(mockMessages, mockOnChunk, mockOnComplete, mockOnError, false);

      expect(streamText).toHaveBeenCalledWith({
        model: expect.any(Object),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: 'Hello',
              }),
            ]),
          }),
        ]),
        temperature: 0.1,
      });

      // Wait a bit for async iteration to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockOnChunk).toHaveBeenCalledWith('Hello! ');
      expect(mockOnChunk).toHaveBeenCalledWith('Hello! How can ');
      expect(mockOnChunk).toHaveBeenCalledWith('Hello! How can I help you?');
      expect(mockOnComplete).toHaveBeenCalledWith('Hello! How can I help you?', [], []);
      expect(mockOnError).not.toHaveBeenCalled();
    });

    it('should handle streaming errors', async () => {
      const { streamText } = await import('ai');
      const mockMessages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
      ];

      const mockOnChunk = vi.fn();
      const mockOnComplete = vi.fn();
      const mockOnError = vi.fn();

      // Mock streamText to simulate an error in streaming
      const mockTextStream = {
        async *[Symbol.asyncIterator]() {
          yield ''; // Add yield to satisfy linter
          throw new Error('Network error');
        },
      };

      const mockResult = {
        textStream: mockTextStream,
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0 }),
        response: Promise.resolve({}),
      };

      (streamText as any).mockReturnValue(mockResult);

      await llmService.streamMessage(mockMessages, mockOnChunk, mockOnComplete, mockOnError, false);

      expect(mockOnError).toHaveBeenCalledWith('Network error');
      expect(mockOnComplete).not.toHaveBeenCalled();
    });

    it('should include tools when enabled', async () => {
      const { streamText } = await import('ai');
      const mockMessages: ChatMessage[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          timestamp: Date.now(),
        },
      ];

      const mockOnChunk = vi.fn();
      const mockOnComplete = vi.fn();
      const mockOnError = vi.fn();

      // Mock streamText
      const mockTextStream = {
        async *[Symbol.asyncIterator]() {
          yield 'Hello!';
        },
      };

      const mockResult = {
        textStream: mockTextStream,
        text: Promise.resolve('Hello!'),
        finishReason: Promise.resolve('stop'),
        usage: Promise.resolve({ promptTokens: 10, completionTokens: 5 }),
        response: Promise.resolve({}),
      };

      (streamText as any).mockReturnValue(mockResult);

      await llmService.streamMessage(
        mockMessages,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        true, // Enable tools
      );

      expect(streamText).toHaveBeenCalledWith({
        model: expect.any(Object),
        messages: expect.any(Array),
        temperature: 0.1,
        tools: expect.any(Array),
      });
    });
  });

  describe('testConnection', () => {
    it('should return success when streaming works', async () => {
      const { streamText } = await import('ai');

      // Mock successful streaming
      const mockTextStream = {
        async *[Symbol.asyncIterator]() {
          yield 'Connection test response';
        },
      };

      const mockResult = {
        textStream: mockTextStream,
        text: Promise.resolve('Connection test response'),
        finishReason: Promise.resolve('stop'),
        usage: Promise.resolve({ promptTokens: 10, completionTokens: 5 }),
        response: Promise.resolve({}),
      };

      (streamText as any).mockReturnValue(mockResult);

      const result = await llmService.testConnection();

      expect(result).toEqual({ success: true });
    });

    it('should return failure when streaming fails', async () => {
      const { streamText } = await import('ai');

      // Mock streaming failure
      const mockTextStream = {
        async *[Symbol.asyncIterator]() {
          yield ''; // Add yield to satisfy linter
          throw new Error('Connection failed');
        },
      };

      const mockResult = {
        textStream: mockTextStream,
        text: Promise.resolve(''),
        finishReason: Promise.resolve('stop'),
        usage: Promise.resolve({ promptTokens: 0, completionTokens: 0 }),
        response: Promise.resolve({}),
      };

      (streamText as any).mockReturnValue(mockResult);

      const result = await llmService.testConnection();

      expect(result).toEqual({
        success: false,
        error: 'Connection failed',
      });
    });

    it('should test with correct message format', async () => {
      const { streamText } = await import('ai');

      // Mock successful streaming
      const mockTextStream = {
        async *[Symbol.asyncIterator]() {
          yield 'Hello';
        },
      };

      const mockResult = {
        textStream: mockTextStream,
        text: Promise.resolve('Hello'),
        finishReason: Promise.resolve('stop'),
        usage: Promise.resolve({ promptTokens: 10, completionTokens: 5 }),
        response: Promise.resolve({}),
      };

      (streamText as any).mockReturnValue(mockResult);

      await llmService.testConnection();

      expect(streamText).toHaveBeenCalledWith({
        model: expect.any(Object),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            parts: expect.arrayContaining([
              expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('connection test'),
              }),
            ]),
          }),
        ]),
        temperature: 0.1,
      });
    });
  });

  describe('updateProvider', () => {
    it('should update the model when using custom endpoint', () => {
      const newProvider: LLMProvider = {
        name: 'New Provider',
        endpoint: 'http://new-endpoint.com/v1/chat/completions',
        model: 'new-model',
        apiKey: 'new-key',
      };

      llmService.updateProvider(newProvider);

      // Check that model was created (it should be defined and have the correct modelId)
      expect((llmService as any).model).toBeDefined();
      expect((llmService as any).model.modelId).toBe('new-model');
    });

    it('should create OpenAI model when using OpenAI endpoint', () => {
      const openaiProvider: LLMProvider = {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4',
        apiKey: 'sk-test',
      };

      llmService.updateProvider(openaiProvider);

      // Check that model was created
      expect((llmService as any).model).toBeDefined();
      expect((llmService as any).model.modelId).toBe('gpt-4');
    });
  });
});
