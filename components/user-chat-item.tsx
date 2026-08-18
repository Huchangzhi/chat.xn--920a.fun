import type { MessagePart } from "@/lib/db";
import { cn } from "@/lib/utils";

const UserChatItem = ({
  className,
  parts,
}: {
  className?: string;
  parts: MessagePart[];
}) => {
  return (
    <div className={cn("space-y-1 flex flex-col", className)}>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <div
              key={`${part.type}-${index}`}
              className="bg-[var(--dsw-specific-bubble)] rounded-[22px] px-4 py-2.5 text-base leading-6 text-[var(--dsw-alias-label-primary)] self-end"
            >
              {part.text}
            </div>
          );
        }

        if (part.type === "file") {
          if (part.mediaType.startsWith("image/")) {
            return (
              // biome-ignore lint/performance/noImgElement: <data_url>
              <img
                key={`${part.type}-${index}`}
                src={part.url}
                alt={part.filename}
                className="hover:brightness-75 transition-all rounded-xl object-cover size-full max-w-[60%] self-end"
              />
            );
          }
        }

        return null;
      })}
    </div>
  );
};

export default UserChatItem;
