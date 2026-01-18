import { LanguageModelV1, LanguageModelV1CallOptions, LanguageModelV1StreamPart, LanguageModelV1FinishReason, LanguageModelV1CallWarning, LanguageModelV1FunctionTool } from '@ai-sdk/provider';
import { convertToModelMessages, LanguageModelV1CallSettings } from 'ai';

interface CustomOpenAIConfig {
  apiKey: string;
  baseURL?: string;
  modelId: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: any[];
  tool_choice?: string;
}

interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
        type?: string;
      }>;
    };
    finish_reason: string | null;
  }>;
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
    return this.config.modelId;
  }

  async callAPI(options: LanguageModelV1CallOptions): Promise<any> {
    const { prompt, maxTokens, temperature, tools } = options;

    // 将 prompt 转换为消息格式
    const messages = convertToModelMessages(prompt);

    const requestBody: ChatCompletionRequest = {
      model: this.config.modelId,
      messages: messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : this.formatContentArray(msg.content)
      })),
      stream: false,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 1024,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map((tool: LanguageModelV1FunctionTool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(this.getBaseURL(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  }

  async doStream(options: LanguageModelV1CallOptions): Promise<{
    stream: AsyncIterable<LanguageModelV1StreamPart>;
    rawCall: any;
    warnings: LanguageModelV1CallWarning[] | undefined;
  }> {
    const { prompt, maxTokens, temperature, tools } = options;

    // 将 prompt 转换为消息格式
    const messages = convertToModelMessages(prompt);

    const requestBody: ChatCompletionRequest = {
      model: this.config.modelId,
      messages: messages.map(msg => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : this.formatContentArray(msg.content)
      })),
      stream: true,
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 1024,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools.map((tool: LanguageModelV1FunctionTool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(this.getBaseURL(), {
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
                yield { type: 'finish', finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
                return;
              }

              try {
                const parsed = JSON.parse(data);

                if (parsed.choices && parsed.choices.length > 0) {
                  const choice = parsed.choices[0];

                  if (choice.delta?.content) {
                    yield {
                      type: 'text-delta',
                      textDelta: choice.delta.content,
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
                }
              } catch (e) {
                // Skip invalid JSON lines
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

  private getBaseURL(): string {
    // 如果提供了基础 URL，则使用它，否则使用默认的 OpenAI API 地址
    const baseUrl = this.config.baseURL || 'https://api.openai.com/v1';
    // 确保 URL 以 /chat/completions 结尾
    return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
  }

  private formatContentArray(content: any[]): string {
    return content.map(item => {
      if (item.type === 'text') {
        return item.text;
      } else if (item.type === 'image') {
        return '[IMAGE]';
      }
      return '';
    }).join('');
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
export function createCustomOpenAI(config: Omit<CustomOpenAIConfig, 'modelId'>): {
  languageModel: (modelId: string) => LanguageModelV1;
  chat: (modelId: string) => LanguageModelV1;
} {
  return {
    languageModel(modelId: string): LanguageModelV1 {
      return new CustomOpenAIClient({ ...config, modelId });
    },
    chat(modelId: string): LanguageModelV1 {
      return new CustomOpenAIClient({ ...config, modelId });
    },
  };
}