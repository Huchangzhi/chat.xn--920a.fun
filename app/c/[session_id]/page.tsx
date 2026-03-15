"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ChevronDown } from "lucide-react";
import { debounce } from "next/dist/server/utils";
import { useParams, useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import AuthDialog from "@/components/auth-dialog";
import ChatInput, { type onSendMessageProps } from "@/components/chat-input";
import ChatList from "@/components/chat-list";
import Footer from "@/components/footer";
import { Button } from "@/components/ui/button";
import { db, type Message } from "@/lib/db";
import { type Model, defaultModels } from "@/lib/models";

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

const Page = () => {
  const { session_id } = useParams() as { session_id: string };
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") !== null;
  const [loaded, setLoaded] = useState(isNew);
  const [showToBottom, setShowToBottom] = useState(false);
  const [models, setModels] = useState<Model[]>(defaultModels);
  const chatListRef = useRef<HTMLDivElement>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);

  const initMessages = useLiveQuery(
    () =>
      db.message
        .where("sessionId")
        .equals(session_id)
        .limit(100)
        .sortBy("createdAt"),
    [session_id],
  );

  const [selectedModel, setSelectedModel] = useState<Model>(defaultModels[0]);
  const selectedModelRef = useRef<Model>(selectedModel);

  // 保持 ref 与 state 同步
  useEffect(() => {
    selectedModelRef.current = selectedModel;
  }, [selectedModel]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ChatStatus>("ready");

  // 初始化时从 localStorage 读取模型选择，并等待模型列表加载
  useEffect(() => {
    const storedModelData = localStorage.getItem("CF_AI_MODEL");
    
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0) {
          setModels(data);
          // 优先使用 localStorage 中保存的模型
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
                const storedModel = data.find((m: Model) => m.id === storedModelData);
                if (storedModel) {
                  setSelectedModel(storedModel);
                }
              }
            } catch (e) {
              // 如果解析失败，假设是单个模型ID
              const storedModel = data.find((m: Model) => m.id === storedModelData);
              if (storedModel) {
                setSelectedModel(storedModel);
              }
            }
          } else {
            // 如果 localStorage 中没有或找不到，使用列表中的第一个
            setSelectedModel(data[0]);
          }
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (initMessages && !loaded) {
      setMessages(initMessages);
      setLoaded(true);
    }
  }, [initMessages, loaded]);

  const sendMessage = async (data: onSendMessageProps) => {
    const { text, files } = data;
    setStatus("submitted");

    // 直接从 localStorage 读取最新的模型选择，避免闭包问题
    const storedModelData = localStorage.getItem("CF_AI_MODEL");
    let modelToUse;
    
    try {
      // 检查是否是模型列表
      const parsedData = JSON.parse(storedModelData || "null");
      if (Array.isArray(parsedData)) {
        modelToUse = parsedData; // 使用整个模型列表
      } else {
        modelToUse = storedModelData || selectedModelRef.current.id; // 使用单个模型ID
      }
    } catch (e) {
      // 如果解析失败，使用单个模型ID
      modelToUse = storedModelData || selectedModelRef.current.id;
    }

    const messageParts = [
      ...(files ?? []),
      {
        type: "text" as const,
        text,
      },
    ];

    const userMessage: Message = {
      id: generateId(),
      parts: messageParts,
      role: "user",
      sessionId: session_id,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    await db.message.add(userMessage);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: localStorage.getItem("CF_AI_PASSWORD") ?? "",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].slice(-10).map((m) => ({
            role: m.role,
            parts: m.parts,
          })),
          model: modelToUse,
        }),
      });

      if (response.status === 401) {
        setAuthDialogOpen(true);
        setStatus("error");
        return;
      }

      if (!response.ok) {
        throw new Error(await response.text());
      }

      if (!response.body) {
        throw new Error("Response body is empty");
      }

      setStatus("streaming");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantMessage: Message = {
        id: generateId(),
        parts: [{ type: "text", text: "" }],
        role: "assistant",
        sessionId: session_id,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                // 如果API返回错误，显示错误信息
                const firstPart = assistantMessage.parts[0];
                if (firstPart.type === "text") {
                  firstPart.text += `[错误: ${data.error}]`;
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id ? assistantMessage : m,
                  ),
                );
                break; // 遇到错误时停止处理
              } else if (data.content) {
                const firstPart = assistantMessage.parts[0];
                if (firstPart.type === "text") {
                  firstPart.text += data.content;
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessage.id ? assistantMessage : m,
                  ),
                );
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      // Save to database
      await db.message.add(assistantMessage);
      await db.session.update(session_id, {
        updatedAt: new Date(),
      });
      setStatus("ready");
    } catch (error) {
      console.error("Error sending message:", error);
      setStatus("error");
      if (error instanceof Error && error.message !== "Unauthorized") {
        toast.error(error.message);
      }
    }
  };

  const stop = () => {
    setStatus("ready");
  };

  const regenerate = async () => {
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMessage) {
      const textPart = lastUserMessage.parts.find((p) => p.type === "text");
      if (textPart) {
        // Remove assistant messages after the last user message
        const lastUserMessageIndex = messages.findIndex((m) => m.id === lastUserMessage.id);
        const messagesAfterUser = messages.slice(lastUserMessageIndex + 1);
        const assistantMessagesToDelete = messagesAfterUser.filter((m) => m.role === "assistant");
        
        for (const msg of assistantMessagesToDelete) {
          await db.message.delete(msg.id);
        }
        setMessages((prev) => prev.filter((m) => !assistantMessagesToDelete.some((am) => am.id === m.id)));
        
        await sendMessage({ text: textPart.text || "" });
      }
    }
  };

  useEffect(() => {
    if (isNew && initMessages) {
      const text = initMessages[0].parts.find((i) => i.type === "text")?.text;
      const files = initMessages[0].parts.filter((i) => i.type === "file");
      if (text) {
        sendMessage({
          text,
          files,
        });
        history.replaceState(null, "", location.pathname);
      }
    }
  }, [isNew, initMessages]);

  useEffect(() => {
    if (status === "streaming" && chatListRef.current && messages.length) {
      if (
        chatListRef.current.scrollHeight -
          chatListRef.current.scrollTop -
          chatListRef.current.clientHeight <
        250
      ) {
        scrollToBottom();
      }
    }
  }, [status, messages]);

  const scrollToBottom = useCallback(
    (behavior: "smooth" | "instant" = "smooth") => {
      chatListRef.current?.scrollTo({
        top: chatListRef.current.scrollHeight,
        behavior,
      });
    },
    [],
  );

  useEffect(() => {
    const onScroll = debounce(() => {
      if (chatListRef.current) {
        if (
          chatListRef.current.scrollTop + chatListRef.current.clientHeight <
          chatListRef.current.scrollHeight - 100
        ) {
          startTransition(() => setShowToBottom(true));
        } else {
          startTransition(() => setShowToBottom(false));
        }
      }
    }, 100);
    chatListRef.current?.addEventListener("scroll", onScroll);

    return () => chatListRef.current?.removeEventListener("scroll", onScroll);
  }, []);

  const onSendMessage = async (data: onSendMessageProps) => {
    const { text, files } = data;

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
      sessionId: session_id,
      createdAt: new Date(),
    });
    await db.session.update(session_id, {
      updatedAt: new Date(),
    });

    scrollToBottom();

    await sendMessage({
      text,
      files,
    });
  };

  return (
    <div className="flex flex-col h-screen">
      <div
        ref={chatListRef}
        className="overflow-y-auto scrollbar px-2"
        style={{ scrollbarGutter: "stable both-edges" }}
      >
        <ChatList
          status={status}
          messages={messages}
          className="pt-16 pb-60 max-w-3xl mx-auto"
        />
      </div>

      <div className="mt-auto pb-1 space-y-1 absolute bottom-0 left-0 right-0 bg-linear-to-t from-background to-transparent px-2">
        {showToBottom && (
          <Button
            size="icon"
            variant="outline"
            className="rounded-full shadow-xl absolute left-1/2 -translate-x-1/2 -top-10 z-10"
            onClick={() => {
              chatListRef.current?.scrollTo({
                top: chatListRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
          >
            <ChevronDown />
          </Button>
        )}

        <ChatInput
          models={models}
          className="mx-auto max-w-3xl bg-background shadow-xl"
          onSendMessage={onSendMessage}
          status={status}
          onStop={stop}
          onRetry={regenerate}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
        />
        <Footer />
      </div>

      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
    </div>
  );
};

export default Page;
