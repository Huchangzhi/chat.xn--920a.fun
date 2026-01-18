// 简单的 fetch 实现，绕过完整的 AI SDK 类型要求
export interface CustomOpenAIConfig {
  apiKey: string;
  baseURL?: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

// 创建一个简单的函数来适配现有代码
export function createCustomOpenAI(config: CustomOpenAIConfig) {
  return {
    chat: (modelId: string) => ({
      // 返回一个模拟的模型对象，用于与现有代码兼容
      doStream: async (options: any) => {
        const { temperature, maxTokens, prompt } = options;

        // 将 prompt 转换为消息格式
        const messages = prompt.map((item: any) => {
          // 确保角色是有效的 OpenAI 角色
          let role: 'system' | 'user' | 'assistant' = 'user';

          if (item.role === 'system' || item.role === 'user' || item.role === 'assistant') {
            role = item.role;
          } else if (item.role === 'developer') {
            // 将 'developer' 角色映射到 'user'，以避免 API 错误
            role = 'user';
          } else {
            // 对于其他未知角色，也映射到 'user'
            role = 'user';
          }

          return {
            role,
            content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content)
          };
        });

        const requestData: ChatCompletionRequest = {
          model: modelId,
          messages,
          stream: true,
          temperature: temperature ?? 0.7,
          max_tokens: maxTokens ?? 1024,
        };

        // 使用提供的基础 URL 或默认值
        const baseUrl = config.baseURL || 'https://api.openai.com/v1';
        const apiUrl = baseUrl.endsWith('/chat/completions')
          ? baseUrl
          : `${baseUrl}/chat/completions`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.apiKey}`,
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
          body: JSON.stringify(requestData),
        });

        if (!response.ok) {
          throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }

        const decoder = new TextDecoder();
        let buffer = '';

        const stream = (async function* () {
          const reader = response.body?.getReader();
          if (!reader) {
            return;
          }

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });

              const lines = buffer.split('\n');
              buffer = lines.pop() || ''; // Keep incomplete line in buffer

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const data = line.slice(6); // Remove 'data: ' prefix

                  if (data === '[DONE]') {
                    yield {
                      type: 'finish',
                      finishReason: 'stop',
                      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
                    };
                    return;
                  }

                  try {
                    const parsed = JSON.parse(data);

                    // 检查是否有错误
                    if (parsed.error) {
                      console.error('API Error:', parsed.error);
                      yield {
                        type: 'error',
                        error: new Error(parsed.error.message || 'API Error')
                      };
                      return;
                    }

                    // 处理正常的响应
                    if (parsed.choices && parsed.choices.length > 0) {
                      const choice = parsed.choices[0];

                      if (choice.delta?.content) {
                        yield {
                          type: 'text-delta',
                          textDelta: choice.delta.content,
                        };
                      } else if (choice.message?.content) {
                        yield {
                          type: 'text-delta',
                          textDelta: choice.message.content,
                        };
                      }

                      if (choice.finish_reason) {
                        yield {
                          type: 'finish',
                          finishReason: choice.finish_reason,
                          usage: {
                            promptTokens: parsed.usage?.prompt_tokens || 0,
                            completionTokens: parsed.usage?.completion_tokens || 0,
                            totalTokens: parsed.usage?.total_tokens || 0,
                          },
                        };
                        return;
                      }
                    } else if (parsed.choices === null || (Array.isArray(parsed.choices) && parsed.choices.length === 0)) {
                      // 特殊处理：如果 choices 是 null 或空数组，可能是 API 返回格式不同
                      // 尝试直接从顶层获取内容
                      if (parsed.content) {
                        yield {
                          type: 'text-delta',
                          textDelta: parsed.content,
                        };
                      }
                    }
                  } catch (e) {
                    console.warn('Failed to parse SSE data:', e, data);
                    // 继续处理下一行
                    continue;
                  }
                }
              }
            }
          } finally {
            reader.releaseLock();
          }
        })();

        return {
          stream,
          rawCall: {},
          warnings: [],
        };
      }
    })
  };
}