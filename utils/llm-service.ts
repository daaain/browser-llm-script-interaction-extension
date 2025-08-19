import type { ChatMessage, LLMProvider, LLMResponse } from "../shared/types";

export class LLMService {
  constructor(private provider: LLMProvider) {}

  async sendMessage(messages: ChatMessage[]): Promise<LLMResponse> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.provider.apiKey) {
        headers.Authorization = `Bearer ${this.provider.apiKey}`;
      }

      const requestBody = {
        model: this.provider.model,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.7,
        max_tokens: 2000,
        stream: true,
      };

      console.log("Sending request to LLM:", {
        endpoint: this.provider.endpoint,
        model: this.provider.model,
        messageCount: messages.length,
      });

      const response = await fetch(this.provider.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        mode: "cors",
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let content = "";

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);

              if (data === "[DONE]") {
                break;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.error) {
                  throw new Error(parsed.error.message || "Unknown API error");
                }

                if (parsed.choices?.[0]?.delta?.content) {
                  content += parsed.choices[0].delta.content;
                }
              } catch (_parseError) {}
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      return {
        content: content.trim(),
      };
    } catch (error) {
      console.error("LLM API Error:", error);
      return {
        content: "",
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  updateProvider(provider: LLMProvider) {
    this.provider = provider;
  }
}
