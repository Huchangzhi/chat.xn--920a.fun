"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatInput, { type onSendMessageProps } from "@/components/chat-input";
import Footer from "@/components/footer";
import { db } from "@/lib/db";
import { type Model, defaultModels } from "@/lib/models";

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export default function Home() {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>(defaultModels);
  const [selectedModel, setSelectedModel] = useState<Model>(defaultModels[0]);
  const hasInitialized = useRef(false);

  // 初始化时从 localStorage 读取模型选择
  useEffect(() => {
    const storedModelData = localStorage.getItem("CF_AI_MODEL");
    if (storedModelData) {
      try {
        // 检查是否是模型列表
        const parsedData = JSON.parse(storedModelData);
        if (Array.isArray(parsedData)) {
          // 如果是模型列表，检查是否是旗舰模型
          const modelConfig = localStorage.getItem("CF_AI_MODEL_CONFIG");
          if (modelConfig) {
            try {
              const config = JSON.parse(modelConfig);
              // 尝试找到匹配的旗舰模型配置
              for (const [category, subCategories] of Object.entries(config as Record<string, Record<string, string[]>>)) {
                for (const [subCategory, modelList] of Object.entries(subCategories)) {
                  if (JSON.stringify(modelList) === JSON.stringify(parsedData)) {
                    // 找到匹配的旗舰模型配置
                    const fallbackModel = {
                      id: modelList[0], // 使用第一个模型作为ID
                      name: `${category} (${subCategory})`, // 显示为"旗舰模型 (模式)"
                      type: "Text Generation",
                      provider: "openai",
                    } as Model;
                    // 添加额外属性
                    (fallbackModel as any).fallbackList = parsedData;
                    (fallbackModel as any).selectedCategory = category;
                    (fallbackModel as any).selectedSubCategory = subCategory;
                    setSelectedModel(fallbackModel);
                    return; // 找到后直接返回
                  }
                }
              }
            } catch (e) {
              console.error("Error parsing model config from localStorage:", e);
            }
          }
          
          // 如果不是旗舰模型配置，按普通模型列表处理
          const firstModelId = parsedData[0];
          const fallbackModel = {
            id: firstModelId,
            name: `${firstModelId} (fallback)`,
            type: "Text Generation",
            provider: "openai",
          } as Model;
          // 添加fallbackList属性
          (fallbackModel as any).fallbackList = parsedData;
          setSelectedModel(fallbackModel);
        } else {
          // 如果是单个模型ID，使用默认逻辑
          const storedModel = defaultModels.find((m) => m.id === storedModelData);
          if (storedModel) {
            setSelectedModel(storedModel);
          }
        }
      } catch (e) {
        // 如果解析失败，假设是单个模型ID
        const storedModel = defaultModels.find((m) => m.id === storedModelData);
        if (storedModel) {
          setSelectedModel(storedModel);
        }
      }
    }
  }, []);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0) {
          setModels(data);
          if (!hasInitialized.current) {
            const storedModelId = localStorage.getItem("CF_AI_MODEL");
            const storedModel = data.find((m: Model) => m.id === storedModelId);
            if (storedModel) {
              setSelectedModel(storedModel);
            }
            hasInitialized.current = true;
          }
        }
      })
      .catch(console.error);
  }, []);

  const onSendMessage = useCallback(
    async (data: onSendMessageProps) => {
      const { text, files, model } = data;

      const sessionId = crypto.randomUUID();
      
      // 保存当前选择的模型到 localStorage
      const modelToSave = model || selectedModel;
      if ((modelToSave as any).fallbackList) {
        // 如果模型有fallbackList，保存整个列表
        localStorage.setItem("CF_AI_MODEL", JSON.stringify((modelToSave as any).fallbackList));
      } else {
        localStorage.setItem("CF_AI_MODEL", modelToSave.id);
      }
      localStorage.setItem("CF_AI_MODEL_SELECTED", "true");
      
      await db.session.add({
        updatedAt: new Date(),
        name: text.slice(0, 20),
        id: sessionId,
      });
      await db.message.add({
        id: generateId(),
        parts: [
          ...(files ?? []),
          {
            type: "text",
            text,
          },
        ],
        role: "user",
        sessionId,
        createdAt: new Date(),
      });

      router.replace(`/c/${sessionId}?new`);
    },
    [router, selectedModel],
  );

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <div className="flex flex-col justify-center h-full w-full space-y-4 px-4">
        <div className="font-bold text-2xl mx-auto font-mono">
          How can I assist you today?
        </div>
        <ChatInput
          models={models}
          className="mx-auto max-w-3xl"
          onSendMessage={onSendMessage}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
        />
      </div>

      <Footer classname="mt-auto mb-1" />
    </div>
  );
}
