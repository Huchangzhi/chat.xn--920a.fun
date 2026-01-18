import type { LanguageModelV2 } from "@ai-sdk/provider";
import {
  convertToModelMessages,
  extractReasoningMiddleware,
  stepCountIs,
  streamText,
  wrapLanguageModel,
} from "ai";
import { aigateway, google, workersai, openai } from "@/app/api";
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

export async function POST(request: Request) {
  const { messages, model, provider, search } = (await request.json()) as Data;

  let providerModel: LanguageModelV2;
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
    case "openai":
      providerModel = wrapLanguageModel({
        model: openai.chat(model),
        middleware: extractReasoningMiddleware({
          tagName: "think", // 使用think标签来识别思考部分，对应 [[thinking]] 和 [[/thinking]] 标签
          startWithReasoning: false, // 默认不开启推理模式
        }),
      });
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
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
