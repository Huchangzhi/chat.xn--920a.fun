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
    const storedModelId = localStorage.getItem("CF_AI_MODEL");
    if (storedModelId) {
      const storedModel = defaultModels.find((m) => m.id === storedModelId);
      if (storedModel) {
        setSelectedModel(storedModel);
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
      const { text, files } = data;

      const sessionId = crypto.randomUUID();
      
      // 保存当前选择的模型到 localStorage
      localStorage.setItem("CF_AI_MODEL", selectedModel.id);
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
