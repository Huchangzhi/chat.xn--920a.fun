"use client";

import { generateId } from "ai";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import ChatInput, { type onSendMessageProps } from "@/components/chat-input";
import Footer from "@/components/footer";
import { db } from "@/lib/db";
import { type Model, defaultModels } from "@/lib/models";

export default function Home() {
  const router = useRouter();
  const [models, setModels] = useState<Model[]>(defaultModels);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0) {
          setModels(data);
        }
      })
      .catch(console.error);
  }, []);

  const onSendMessage = useCallback(
    async (data: onSendMessageProps) => {
      const { text, files } = data;

      const sessionId = crypto.randomUUID();
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
    [router],
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
        />
      </div>

      <Footer classname="mt-auto mb-1" />
    </div>
  );
}
