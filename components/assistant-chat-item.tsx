import { Streamdown } from "streamdown";
import type { Message } from "@/lib/db";

const AssistantChatItem = ({
  className,
  parts,
}: {
  className?: string;
  parts: Message["parts"];
}) => {
  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (part.type === "text") {
          return <Streamdown key={`${part.type}-${index}`}>{part.text}</Streamdown>;
        }

        return null;
      })}
    </div>
  );
};

export default AssistantChatItem;
