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
    const storedModelId = localStorage.getItem("CF_AI_MODEL");
    
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (data.length > 0) {
          setModels(data);
          // 优先使用 localStorage 中保存的模型
          if (storedModelId) {
            const storedModel = data.find((m: Model) => m.id === storedModelId);
            if (storedModel) {
              setSelectedModel(storedModel);
              return;
            }
          }
          // 如果 localStorage 中没有或找不到，使用列表中的第一个
          setSelectedModel(data[0]);
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
    const modelId = localStorage.getItem("CF_AI_MODEL") || selectedModelRef.current.id;

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
          model: modelId,
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
              if (data.content) {
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
