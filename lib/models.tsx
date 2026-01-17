import type { ReactNode } from "react";
import {
  DeepSeekLogo,
  GoogleLogo,
  IBMLogo,
  MetaLogo,
  MistralLogo,
  QWenLogo,
  OpenAILogo,
} from "@/components/logo";

export interface Model {
  id: string;
  name: string;
  logo: ReactNode;
  type: "Text Generation" | "Text to Image";
  input?: Array<"image" | "search">;
  provider: "workers-ai" | "google" | "openai";
  tag?: string[];
}

const defaultLogo = (
  <div className="bg-linear-to-br from-secondary to-primary size-4 rounded-full"></div>
);

// 注释掉所有现有模型
/*
export const modelList: Model[] = [
  {
    id: "gemini-2.5-flash",
    name: "gemini-2.5-flash",
    logo: <GoogleLogo />,
    type: "Text Generation",
    input: ["image", "search"],
    provider: "google",
    tag: ["new"],
  },
  {
    id: "gemini-2.5-pro",
    name: "gemini-2.5-pro",
    logo: <GoogleLogo />,
    type: "Text Generation",
    input: ["image", "search"],
    provider: "google",
    tag: ["new"],
  },
  {
    id: "@cf/ibm-granite/granite-4.0-h-micro",
    name: "granite-4.0-h-micro",
    logo: <IBMLogo />,
    type: "Text Generation",
    provider: "workers-ai",
    tag: ["new"],
  },
  {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    name: "llama-4-scout",
    logo: <MetaLogo />,
    type: "Text Generation",
    // input: ["image"],
    provider: "workers-ai",
    tag: ["17b"],
  },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    name: "mistral-small-3.1",
    logo: <MistralLogo />,
    type: "Text Generation",
    // input: ["image"],
    provider: "workers-ai",
    tag: ["24b"],
  },
  {
    id: "@cf/qwen/qwq-32b",
    name: "qwq",
    logo: <QWenLogo />,
    type: "Text Generation",
    // input: ["image"],
    provider: "workers-ai",
    tag: ["32b"],
  },
  {
    id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    name: "deepseek-r1-distill-qwen",
    logo: <DeepSeekLogo />,
    type: "Text Generation",
    provider: "workers-ai",
    tag: ["32b"],
  },
  {
    id: "@cf/bytedance/stable-diffusion-xl-lightning",
    name: "stable-diffusion-xl-lightning",
    logo: defaultLogo,
    type: "Text to Image",
    provider: "workers-ai",
  },
  {
    id: "@cf/black-forest-labs/flux-1-schnell",
    name: "flux-1-schnell",
    logo: defaultLogo,
    type: "Text to Image",
    provider: "workers-ai",
  },
  {
    id: "@cf/leonardo/lucid-origin",
    name: "lucid-origin",
    logo: defaultLogo,
    type: "Text to Image",
    provider: "workers-ai",
  },
  {
    id: "@cf/lykon/dreamshaper-8-lcm",
    name: "dreamshaper-8-lcm",
    logo: defaultLogo,
    type: "Text to Image",
    provider: "workers-ai",
  },
];
*/

// 添加新的模型列表，包括OpenAI的gpt-4o
export const modelList: Model[] = [
  // OpenAI 模型示例
  {
    id: "gpt-4o",
    name: "GPT-4o",
    logo: <OpenAILogo />,
    type: "Text Generation",
    input: ["image"],
    provider: "openai",
    tag: ["new"],
  },
];

const providers = process.env.NEXT_PUBLIC_CF_AI_GATEWAY_PROVIDERS?.split(",");

// 修改过滤逻辑，使其不依赖于环境变量
export const models = modelList.filter(
  (i) => !providers || providers.includes(i.provider) || i.provider === "openai",
);
