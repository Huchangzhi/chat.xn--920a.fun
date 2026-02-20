import type { MessagePart } from "@/lib/db";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Brain } from "lucide-react";
import MarkdownLatexRenderer from "@/components/markdown-latex-renderer";

interface TextPart {
  type: "text";
  text: string;
}

interface ReasoningPart {
  type: "reasoning";
  text: string;
  state: "streaming" | "done";
}

type DisplayPart = TextPart | ReasoningPart;

const AssistantChatItem = ({
  className,
  parts,
}: {
  className?: string;
  parts: MessagePart[];
}) => {
  // 解析思考标签
  const parseParts = (): DisplayPart[] => {
    const displayParts: DisplayPart[] = [];

    for (const part of parts) {
      if (part.type === "text") {
        const text = part.text;
        const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
        let lastIndex = 0;
        let match;

        while ((match = thinkRegex.exec(text)) !== null) {
          // 添加思考前的普通文本
          if (match.index > lastIndex) {
            displayParts.push({
              type: "text",
              text: text.slice(lastIndex, match.index),
            });
          }

          // 添加思考内容
          displayParts.push({
            type: "reasoning",
            text: match[1].trim(),
            state: "done",
          });

          lastIndex = match.index + match[0].length;
        }

        // 添加剩余的普通文本
        if (lastIndex < text.length) {
          displayParts.push({
            type: "text",
            text: text.slice(lastIndex),
          });
        }
      }
    }

    return displayParts;
  };

  const displayParts = parseParts();

  return (
    <div className={className}>
      {displayParts.map((part, index) => {
        if (part.type === "text") {
          return <MarkdownLatexRenderer key={`text-${index}`} content={part.text} />;
        }

        if (part.type === "reasoning") {
          return (
            <Accordion key={`reasoning-${index}`} type="single" collapsible>
              <AccordionItem value={`reasoning-${index}`}>
                <AccordionTrigger>
                  <div className="flex items-center">
                    <Brain className="size-4 mr-2" />
                    Reasoning
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <MarkdownLatexRenderer mode="static" content={part.text} />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          );
        }

        return null;
      })}
    </div>
  );
};

export default AssistantChatItem;
