import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAiGateway } from "ai-gateway-provider";
import { createWorkersAI } from "workers-ai-provider";

export const aigateway = createAiGateway({
  accountId: process.env.CF_ACCOUNT_ID || "",
  gateway: process.env.CF_AI_GATEWAY_NAME || "",
  apiKey: process.env.CF_AI_GATEWAY_TOKEN || "",
});

export const workersai = createWorkersAI({
  accountId: process.env.CF_ACCOUNT_ID || "",
  apiKey: process.env.CF_WORKERS_AI_TOKEN || "",
});

export const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY,
});

export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined, // 允许自定义OpenAI API基础URL，默认为官方地址
});
