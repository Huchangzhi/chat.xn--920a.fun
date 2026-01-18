import {
  convertToModelMessages,
  streamText,
  wrapLanguageModel,
  extractReasoningMiddleware,
} from "ai";
import { aigateway, google, workersai } from "@/app/api";
import type { Message } from "@/lib/db";
import type { Model } from "@/lib/models";

interface Data {
  messages: Message[];
  model: Model["id"];
  provider: Model["provider"];
  search?: boolean;
}

// 验证并清理消息，确保只有有效的角色
function validateAndCleanMessages(messages: Message[]) {
  return messages.map(message => {
    // 确保角色是有效的 OpenAI 角色
    let role: 'system' | 'user' | 'assistant' = 'user';

    if (message.role === 'system' || message.role === 'user' || message.role === 'assistant') {
      role = message.role;
    } else if (message.role === 'developer') {
      // 将 'developer' 角色映射到 'user'，以避免 API 错误
      role = 'user';
    } else {
      // 对于其他未知角色，也映射到 'user'
      role = 'user';
    }

    return {
      ...message,
      role
    };
  });
}

// 直接使用 fetch 实现 OpenAI API 调用
async function callOpenAIApi(messages: Message[], model: string, provider: string) {
  const controller = new AbortController();
  const { signal } = controller;

  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  // 构建 API URL
  const apiUrl = `${baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`}/chat/completions`;

  // 清理消息以确保没有无效的角色
  const cleanedMessages = validateAndCleanMessages(messages);

  const requestBody = {
    model,
    messages: cleanedMessages.map(m => {
      // UIMessage 使用 parts 数组存储内容
      let content = '';
      if (Array.isArray(m.parts)) {
        content = m.parts
          .map(part => {
            if ('text' in part && typeof part.text === 'string') {
              return part.text;
            }
            return '';
          })
          .join('');
      } else {
        content = 'Empty message';
      }

      return {
        role: m.role,
        content
      };
    }),
    stream: true,
    temperature: 0.7,
  };

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body is empty');
  }

  const reader = response.body.getReader();

  // 创建一个可读流来处理服务器发送的事件
  const readableStream = new ReadableStream({
    async start(controller) {
      let buffer = '';

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
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(data);

                // 检查是否有错误
                if (parsed.error) {
                  console.error('API Error:', parsed.error);
                  controller.error(new Error(parsed.error.message || 'API Error'));
                  return;
                }

                // 处理正常的响应
                if (parsed.choices && parsed.choices.length > 0) {
                  const choice = parsed.choices[0];

                  if (choice.delta?.content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: choice.delta.content })}\n\n`));
                  }

                  if (choice.finish_reason) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
                  }
                } else if (parsed.choices === null || (Array.isArray(parsed.choices) && parsed.choices.length === 0)) {
                  // 特殊处理：如果 choices 是 null 或空数组，可能是 API 返回格式不同
                  // 尝试直接从顶层获取内容
                  if (parsed.content) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: parsed.content })}\n\n`));
                  }
                }
              } catch (e) {
                console.warn('Failed to parse SSE data:', e, data);
                // 忽略无效的 JSON 行
                continue;
              }
            }
          }
        }
      } catch (error) {
        controller.error(error);
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  });
}

export async function POST(request: Request) {
  const { messages, model, provider, search } = (await request.json()) as Data;

  // 根据提供商选择处理方式
  if (provider === 'openai') {
    // 直接处理 OpenAI 请求
    return await callOpenAIApi(messages, model, provider);
  }

  // 对于其他提供商，使用原有逻辑
  let providerModel;
  const tools = {};
  switch (provider) {
    case "google":
      providerModel = aigateway([google.chat(model)]);

      Object.assign(tools, {
        // code_execution: google.tools.codeExecution({}),
        // url_context: google.tools.urlContext({}),
        ...(search ? { google_search: google.tools.googleSearch({}) } : {}),
      });
      break;
    case "workers-ai":
      providerModel = wrapLanguageModel({
        model: workersai.chat(model),
        middleware: extractReasoningMiddleware({
          tagName: "think",
          startWithReasoning: model === "@cf/qwen/qwq-32b",
        }),
      });

      // if (process.env.VERCEL_OIDC_TOKEN) {
      //   Object.assign(tools, {
      //     executeCode: executeCode(),
      //   });
      // }
      break;
  }

  // 清理消息以确保没有无效的角色
  const cleanedMessages = validateAndCleanMessages(messages);

  const result = streamText({
    model: providerModel,
    messages: convertToModelMessages(cleanedMessages),
    maxOutputTokens: provider === "workers-ai" ? 2048 : undefined,
    system:
      "You are a helpful assistant. Follow the user's instructions carefully. Respond using Markdown.",
    tools,
  });

  return result.toUIMessageStreamResponse();
}
