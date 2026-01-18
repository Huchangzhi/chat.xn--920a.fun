import { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1StreamPart, LanguageModelV1FinishReason, LanguageModelV1CallWarning } from '@ai-sdk/provider';
import { convertToModelMessages } from 'ai';

interface CustomOpenAIConfig {
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

export class CustomOpenAIClient implements LanguageModelV1 {
  private config: CustomOpenAIConfig;

  constructor(config: CustomOpenAIConfig) {
    this.config = config;
  }

  readonly specificationVersion = 'v1';
  readonly defaultObjectGenerationMode = 'tool';
  readonly supportsImageUrls = false;

  get provider(): string {
    return 'custom-openai';
  }

  get modelId(): string {
    // 这个值会被覆盖，因为我们会在调用时传入正确的模型ID
    return 'custom-model';
  }

  async callAPI(options: LanguageModelV1CallOptions): Promise<any> {
    // 此方法不需要实现，因为我们主要使用流式响应
    throw new Error('Not implemented');
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<{
    stream: AsyncIterable<LanguageModelV1StreamPart>;
    rawCall: any;
    warnings: LanguageModelV1CallWarning[] | undefined;
  }> {
    const { prompt, maxTokens, temperature, modelId } = options;
    
    // 将 prompt 转换为消息格式
    const messages = convertToModelMessages(prompt);
    
    const requestBody: ChatCompletionRequest = {
      model: modelId,
      messages: messages.map(msg => {
        // 确保角色是有效的 OpenAI 角色
        let role: 'system' | 'user' | 'assistant' = 'user';
        
        if (msg.role === 'system' || msg.role === 'user' || msg.role === 'assistant') {
          role = msg.role;
        } else if (msg.role === 'developer') {
          // 将 'developer' 角色映射到 'user'
          role = 'user';
        } else {
          // 对于其他未知角色，也映射到 'user'
          role = 'user';
        }
        
        return {
          role,
          content: typeof msg.content === 'string' 
            ? msg.content 
            : Array.isArray(msg.content) 
              ? msg.content.map(c => 
                  c.type === 'text' ? c.text : `[${c.type}]`
                ).join(' ')
              : String(msg.content)
        };
      }),
      stream: true,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 1024,
    };

    // 使用提供的基础 URL 或默认值
    const baseUrl = this.config.baseURL || 'https://api.openai.com/v1';
    const apiUrl = baseUrl.endsWith('/chat/completions') 
      ? baseUrl 
      : `${baseUrl}/chat/completions`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body: JSON.stringify(requestBody),
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
                  finishReason: 'stop' as LanguageModelV1FinishReason, 
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
                    const finishReason = mapFinishReason(choice.finish_reason);
                    yield {
                      type: 'finish',
                      finishReason,
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
}

function mapFinishReason(reason: string): LanguageModelV1FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'content-filter';
    case 'tool_calls':
      return 'tool-calls';
    case 'function_call':
      return 'tool-calls';
    default:
      return 'unknown';
  }
}

// 创建一个函数来创建自定义 OpenAI 客户端
export function createCustomOpenAI(config: CustomOpenAIConfig) {
  return {
    languageModel(modelId: string): LanguageModelV1 {
      return new CustomOpenAIClient(config);
    },
    chat(modelId: string): LanguageModelV1 {
      return new CustomOpenAIClient({...config, modelId});
    },
  };
}