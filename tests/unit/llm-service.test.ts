import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLMService } from "../../utils/llm-service";
import type { ChatMessage, LLMProvider } from "../../utils/types";

global.fetch = vi.fn();

describe("LLMService", () => {
  let llmService: LLMService;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    mockProvider = {
      name: "Test Provider",
      endpoint: "http://localhost:1234/v1/chat/completions",
      model: "test-model",
      apiKey: "test-key",
    };

    llmService = new LLMService(mockProvider);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("sendMessage", () => {
    it("should send a message and return a response", async () => {
      const mockMessages: ChatMessage[] = [
        {
          id: "1",
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
        },
      ];

      const streamChunks = [
        'data: {"choices":[{"delta":{"content":"Hello! "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"How can "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"I help you today?"}}]}\n\n',
        "data: [DONE]\n\n",
      ];

      const mockStream = new ReadableStream({
        start(controller) {
          streamChunks.forEach((chunk) => {
            controller.enqueue(new TextEncoder().encode(chunk));
          });
          controller.close();
        },
      });

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      const result = await llmService.sendMessage(mockMessages);

      expect(fetch).toHaveBeenCalledWith(mockProvider.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mockProvider.apiKey}`,
        },
        body: JSON.stringify({
          model: mockProvider.model,
          messages: [{ role: "user", content: "Hello" }],
          temperature: 0.7,
          max_tokens: 2000,
          stream: true,
        }),
        mode: "cors",
      });

      expect(result).toEqual({
        content: "Hello! How can I help you today?",
      });
    });

    it("should handle API errors", async () => {
      const mockMessages: ChatMessage[] = [
        {
          id: "1",
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
        },
      ];

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const result = await llmService.sendMessage(mockMessages);

      expect(result).toEqual({
        content: "",
        error: "HTTP 401: Unauthorized",
      });
    });

    it("should handle network errors", async () => {
      const mockMessages: ChatMessage[] = [
        {
          id: "1",
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
        },
      ];

      (fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const result = await llmService.sendMessage(mockMessages);

      expect(result).toEqual({
        content: "",
        error: "Network error",
      });
    });

    it("should work without API key for local models", async () => {
      const providerWithoutKey: LLMProvider = {
        name: "Local Provider",
        endpoint: "http://localhost:1234/v1/chat/completions",
        model: "local-model",
      };

      llmService = new LLMService(providerWithoutKey);

      const mockMessages: ChatMessage[] = [
        {
          id: "1",
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
        },
      ];

      const streamChunks = [
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"from local model!"}}]}\n\n',
        "data: [DONE]\n\n",
      ];

      const mockStream = new ReadableStream({
        start(controller) {
          streamChunks.forEach((chunk) => {
            controller.enqueue(new TextEncoder().encode(chunk));
          });
          controller.close();
        },
      });

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      const result = await llmService.sendMessage(mockMessages);

      expect(fetch).toHaveBeenCalledWith(providerWithoutKey.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: providerWithoutKey.model,
          messages: [{ role: "user", content: "Hello" }],
          temperature: 0.7,
          max_tokens: 2000,
          stream: true,
        }),
        mode: "cors",
      });

      expect(result).toEqual({
        content: "Hello from local model!",
      });
    });
  });

  describe("updateProvider", () => {
    it("should update the provider", () => {
      const newProvider: LLMProvider = {
        name: "New Provider",
        endpoint: "http://new-endpoint.com/v1/chat/completions",
        model: "new-model",
        apiKey: "new-key",
      };

      llmService.updateProvider(newProvider);

      expect((llmService as any).provider).toEqual(newProvider);
    });
  });
});
