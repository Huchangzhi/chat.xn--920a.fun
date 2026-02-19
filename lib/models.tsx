export interface Model {
  id: string;
  name: string;
  type: "Text Generation";
  input?: Array<"image" | "search">;
  provider: "openai";
  tag?: string[];
}

// 默认模型列表（当无法从 API 获取时使用）
export const defaultModels: Model[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o-mini",
    type: "Text Generation",
    input: ["image"],
    provider: "openai",
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    type: "Text Generation",
    input: ["image"],
    provider: "openai",
  },
  {
    id: "o1-mini",
    name: "o1-mini",
    type: "Text Generation",
    provider: "openai",
  },
  {
    id: "o1",
    name: "o1",
    type: "Text Generation",
    provider: "openai",
  },
];

// 从 OpenAI API 获取模型列表
export async function fetchOpenAIModels(): Promise<Model[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

  try {
    const response = await fetch(`${baseURL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.error("Failed to fetch models from OpenAI:", response.status);
      return defaultModels;
    }

    const data = await response.json();
    
    // 过滤出聊天模型
    const textModels = data.data
      .filter((model: { id: string }) => {
        const id = model.id.toLowerCase();
        return (
          id.includes("gpt") ||
          id.includes("o1") ||
          id.includes("o3") ||
          id.includes("chat")
        );
      })
      .map((model: { id: string }) => ({
        id: model.id,
        name: model.id,
        type: "Text Generation" as const,
        input: ["image"] as Array<"image">,
        provider: "openai" as const,
      }));

    // 如果没有获取到任何模型，返回默认模型
    return textModels.length > 0 ? textModels : defaultModels;
  } catch (error) {
    console.error("Error fetching OpenAI models:", error);
    return defaultModels;
  }
}

// 客户端获取模型的函数
export async function getModels(): Promise<Model[]> {
  return fetchOpenAIModels();
}
