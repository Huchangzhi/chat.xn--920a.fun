import { streamText, convertToModelMessages, wrapLanguageModel, extractReasoningMiddleware } from "ai";
import { aigateway, google, workersai } from "@/app/api";
import type { Message } from "@/lib/db";
import type { Model } from "@/lib/models";
import { createParser } from 'eventsource-parser';

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

// OpenAI 响应解析器
function openaiParser(chunk: string) {
  try {
    const data = JSON.parse(chunk);

    // 检查是否有错误
    if (data.error) {
      throw new Error(data.error.message || 'API Error');
    }

    // 处理正常的响应
    if (data.choices && data.choices.length > 0) {
      const choice = data.choices[0];
      // 如果有 delta（流式响应）
      if (choice.delta && choice.delta.content !== undefined) {
        return choice.delta.content || '';
      }
      // 如果有 message（非流式响应）
      if (choice.message && choice.message.content !== undefined) {
        return choice.message.content || '';
      }
    } else if (data.choices === null || (Array.isArray(data.choices) && data.choices.length === 0)) {
      // 特殊处理：如果 choices 是 null 或空数组，可能是 API 返回格式不同
      // 尝试直接从顶层获取内容
      if (data.content) {
        return data.content || '';
      }
    }

    return '';
  } catch (e) {
    console.error('Error parsing OpenAI response:', e, chunk);
    return '';
  }
}

// 处理 OpenAI API 调用
async function handleOpenAIRequest(messages: Message[], model: string) {
  const cleanedMessages = validateAndCleanMessages(messages);

  // 提取消息内容
  const processedMessages = cleanedMessages.map(m => {
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
  });

  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  // 构建 API URL
  const apiUrl = `${baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`}/chat/completions`;

  const requestBody = {
    model,
    messages: processedMessages,
    stream: true,
    temperature: 0.7,
  };

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
  });

  if (!response.ok) {
    const errorBody = await response.text();
    return new Response(`Error: ${response.status} - ${errorBody}`, {
      status: response.status
    });
  }

  if (!response.body) {
    return new Response('Response body is empty', { status: 500 });
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      const parser = createParser({
        onEvent: (event) => {
          if (event.data === '[DONE]') {
            controller.close();
            return;
          }

          try {
            const parsed = JSON.parse(event.data);
            if (parsed.error) {
              controller.error(new Error(parsed.error.message || 'API Error'));
              return;
            }

            const content = openaiParser(event.data);
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          } catch (e) {
            console.error('Error processing event:', e);
            controller.error(e);
          }
        },
        onError: (error) => {
          console.error('Parser error:', error);
          controller.error(error);
        }
      });

      for await (const chunk of response.body as any) {
        const str = decoder.decode(chunk, { stream: true });
        parser.feed(str);
      }
    },
    cancel() {
      console.log('Stream cancelled');
    }
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
    return await handleOpenAIRequest(messages, model);
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
