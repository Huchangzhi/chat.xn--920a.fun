"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowUp,
  Loader2,
  Paperclip,
  RefreshCw,
  Search,
  Square,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import ModelSelect from "@/components/model-select";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import type { Model } from "@/lib/models";
import { cn } from "@/lib/utils";
import type { FilePart } from "@/lib/db";

export interface onSendMessageProps {
  text: string;
  files?: FilePart[];
  model?: Model;
  searchEnabled?: boolean;
}

type ChatStatus = "submitted" | "streaming" | "ready" | "error";

const formSchema = z.object({
  input: z.string().trim().min(1),
});

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const ChatInput = ({
  className,
  onSendMessage,
  onStop,
  onRetry,
  status = "ready",
  models,
  selectedModel,
  setSelectedModel,
}: {
  className?: string;
  onSendMessage: (data: onSendMessageProps) => void;
  onStop?: () => void;
  onRetry?: () => void;
  status?: ChatStatus;
  models: Model[];
  selectedModel: Model;
  setSelectedModel: (model: Model) => void;
}) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      input: "",
    },
  });
  const input = form.watch("input");
  const [files, setFiles] = useState<FilePart[]>([]);
  const [searchEnabled, setSearchEnabled] = useState(false);

  useEffect(() => {
    setSearchEnabled(localStorage.getItem("CF_AI_SEARCH_ENABLED") === "true");
  }, []);

  useEffect(() => {
    if (selectedModel && !selectedModel.input?.includes("image")) {
      if (files.length > 0) {
        setFiles([]);
      }
    }
  }, [selectedModel, files.length]);

  // 同步搜索开关状态到 localStorage
  useEffect(() => {
    localStorage.setItem("CF_AI_SEARCH_ENABLED", searchEnabled.toString());
  }, [searchEnabled]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    form.resetField("input");
    setFiles([]);
    onSendMessage({
      text: values.input,
      files,
      model: selectedModel,
      searchEnabled,
    });
  }

  const onSendClick = () => {
    switch (status) {
      case "streaming":
        onStop?.();
        break;
      case "error":
        onRetry?.();
        break;
    }
  };

  const onAddFiles = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = async () => {
      const newFiles = await Promise.all(
        Array.from(input.files ?? []).map(async (file) => ({
          type: "file" as const,
          filename: file.name,
          mediaType: file.type,
          url: await fileToBase64(file),
        })),
      );

      setFiles((prevState) => {
        const combinedFiles = [...prevState, ...newFiles];
        if (combinedFiles.length > 5) {
          toast.warning("You can only attach up to 5 images.");
          return combinedFiles.slice(0, 5);
        }
        return combinedFiles;
      });
    };
    input.click();
  };

  const onPaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardItems = event.clipboardData.items;
    const newFiles: FilePart[] = [];

    for (let i = 0; i < clipboardItems.length; i++) {
      const item = clipboardItems[i];
      if (item.kind === "file") {
        event.preventDefault();
        const file = item.getAsFile();
        if (file?.type.startsWith("image/")) {
          const base64 = await fileToBase64(file);
          newFiles.push({
            type: "file",
            filename: file.name,
            mediaType: file.type,
            url: base64,
          });
        }
      }
    }

    if (newFiles.length > 0) {
      setFiles((prevState) => {
        const combinedFiles = [...prevState, ...newFiles];
        if (combinedFiles.length > 5) {
          toast.warning("You can only attach up to 5 images.");
          return combinedFiles.slice(0, 5);
        }
        return combinedFiles;
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div
          className={cn(
            "flex w-full flex-col gap-3 overflow-hidden rounded-[22px] border border-[var(--dsw-alias-border-l2-darkmode-thin)] bg-[var(--dsw-specific-input-major)] pt-2.5 text-base leading-6 shadow-[var(--dsw-shadow-lv2)]",
            className,
          )}
        >
          <FormField
            control={form.control}
            name="input"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    autoFocus
                    className="border-none bg-transparent px-3 pt-1 pb-0 pl-4 text-base leading-6 resize-none max-h-[50vh] scrollbar shadow-none focus-visible:ring-0 caret-[var(--dsw-alias-state-business-primary)] placeholder:text-[var(--dsw-alias-label-caption)]"
                    placeholder="Text here..."
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        form.handleSubmit(onSubmit)();
                      }
                    }}
                    onPaste={onPaste}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <ul className="flex flex-wrap gap-1 px-3">
            {files.map((file, index) => {
              if (file.mediaType.startsWith("image/")) {
                return (
                  <li
                    key={`file-${file.filename}-${index}`}
                    className="size-12 overflow-hidden rounded-md relative group hover:shadow transition-all"
                  >
                    <button
                      type="button"
                      className="absolute group-hover:opacity-100 transition-opacity opacity-0
                     top-0 right-0 bg-black rounded-full cursor-pointer z-10"
                      onClick={() => {
                        setFiles((prevState) =>
                          prevState.filter((_, i) => i !== index),
                        );
                      }}
                    >
                      <X className="size-4 text-white" />
                    </button>
                    {/* biome-ignore lint/performance/noImgElement: <data_url> */}
                    <img
                      src={file.url}
                      alt={file.filename}
                      className="hover:brightness-75 object-cover size-full"
                    />
                  </li>
                );
              }

              return null;
            })}
          </ul>

          <div className="flex min-w-0 items-center gap-3 px-2 pb-1.5">
            <div className="flex min-w-0 items-center gap-2">
              {selectedModel?.input?.includes("image") && (
                <Button
                  size="icon"
                  variant="ghost"
                  type="button"
                  className="relative size-7 shrink-0 rounded-full bg-[var(--dsw-specific-selector)] text-[var(--dsw-alias-label-primary)] hover:bg-[var(--dsw-alias-interactive-bg-hover-solid)] hover:text-[var(--dsw-alias-label-primary)]"
                  onClick={onAddFiles}
                >
                  <Paperclip className="size-4" />
                </Button>
              )}

              <button
                type="button"
                onClick={() => setSearchEnabled(!searchEnabled)}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-medium leading-5 transition-colors",
                  searchEnabled
                    ? "bg-[var(--dsw-specific-selector)] text-[var(--dsw-alias-label-primary)]"
                    : "bg-transparent text-[var(--dsw-alias-label-secondary)] hover:bg-[var(--dsw-alias-interactive-bg-hover)]",
                )}
              >
                <Search className="size-3.5" />
                搜索
              </button>
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-2">
              <ModelSelect
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                models={models}
              />

              <Button
                size="icon"
                type="submit"
                disabled={
                  status === "submitted" ||
                  (input.trim().length === 0 && status === "ready")
                }
                className="size-[34px] rounded-full bg-[var(--dsw-alias-button-info-fill)] text-white hover:bg-[var(--dsw-alias-button-info-hover)] disabled:opacity-40"
              >
                {status === "ready" && <ArrowUp />}
                {status === "submitted" && <Loader2 className="animate-spin" />}
                {status === "streaming" && (
                  <Square className="fill-primary-foreground" />
                )}
                {status === "error" && <RefreshCw />}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
};

export default ChatInput;
