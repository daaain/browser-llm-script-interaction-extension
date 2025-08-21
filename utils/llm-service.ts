import type { ChatMessage, LLMProvider, LLMResponse, LLMTool, LLMToolCall } from "~/utils/types";
import { generateLLMHelperTools } from "~/utils/tool-schema-generator";

export class LLMService {
  constructor(private provider: LLMProvider, private toolsEnabled: boolean = false) {}

  async sendMessage(
    messages: ChatMessage[], 
    tools?: LLMTool[], 
    onStreamChunk?: (content: string, isComplete: boolean) => void
  ): Promise<LLMResponse> {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (this.provider.apiKey) {
        headers.Authorization = `Bearer ${this.provider.apiKey}`;
      }

      const requestBody: any = {
        model: this.provider.model,
        messages: messages.map((msg) => {
          const apiMessage: any = {
            role: msg.role,
            content: msg.content,
          };
          
          // Add tool calls if present (for assistant messages)
          if (msg.tool_calls) {
            apiMessage.tool_calls = msg.tool_calls;
          }
          
          // Add tool call id if this is a tool response message
          if (msg.tool_call_id) {
            apiMessage.tool_call_id = msg.tool_call_id;
          }
          
          return apiMessage;
        }),
        temperature: 0.7,
        max_tokens: 2000,
        stream: true
      };
      
      // Add tools if provided and enabled
      if (tools && tools.length > 0 && this.toolsEnabled) {
        requestBody.tools = tools;
        requestBody.tool_choice = "auto";
      }

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

      // Handle streaming response with tool call support
      if (!response.body) {
        throw new Error("Response body is null");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let content = "";
      let toolCalls: LLMToolCall[] = [];

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

                const delta = parsed.choices?.[0]?.delta;
                if (!delta) continue;

                // Handle regular text content
                if (delta.content) {
                  content += delta.content;
                  // Emit streaming chunk to callback if provided
                  if (onStreamChunk) {
                    onStreamChunk(content, false);
                  }
                }

                // Handle tool calls streaming
                if (delta.tool_calls) {
                  for (const tc of delta.tool_calls) {
                    const index = tc.index || 0;
                    
                    // Ensure we have an array slot for this tool call
                    while (toolCalls.length <= index) {
                      toolCalls.push({
                        id: "",
                        type: "function",
                        function: {
                          name: "",
                          arguments: ""
                        }
                      });
                    }

                    // Accumulate tool call data
                    if (tc.id) {
                      toolCalls[index].id += tc.id;
                    }
                    if (tc.function?.name) {
                      toolCalls[index].function.name += tc.function.name;
                    }
                    if (tc.function?.arguments) {
                      toolCalls[index].function.arguments += tc.function.arguments;
                    }
                  }
                }
              } catch (_parseError) {
                // Skip invalid JSON chunks
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      // Notify completion
      if (onStreamChunk) {
        onStreamChunk(content.trim(), true);
      }

      const result: LLMResponse = {
        content: content.trim(),
      };

      // Add tool calls if any were collected
      if (toolCalls.length > 0 && toolCalls.some(tc => tc.function.name)) {
        result.tool_calls = toolCalls.filter(tc => tc.function.name);
      }

      return result;
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
  
  enableTools(enabled: boolean) {
    this.toolsEnabled = enabled;
  }
  
  getAvailableTools(): LLMTool[] {
    return generateLLMHelperTools();
  }
}
