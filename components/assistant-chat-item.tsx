import { Streamdown } from "streamdown";
import type { MessagePart } from "@/lib/db";

const AssistantChatItem = ({
  className,
  parts,
}: {
  className?: string;
  parts: MessagePart[];
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
