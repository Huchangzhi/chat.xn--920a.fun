// OpenAI API 配置
export const openaiConfig = {
  apiKey: process.env.OPENAI_API_KEY || "",
  baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
};

// 获取完整的 API URL
export function getOpenAIUrl(path: string): string {
  const baseURL = openaiConfig.baseURL.endsWith("/v1")
    ? openaiConfig.baseURL
    : `${openaiConfig.baseURL}/v1`;
  return `${baseURL}${path.startsWith("/") ? path : `/${path}`}`;
}

// 获取授权头
export function getAuthHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${openaiConfig.apiKey}`,
    "Content-Type": "application/json",
  };
}
