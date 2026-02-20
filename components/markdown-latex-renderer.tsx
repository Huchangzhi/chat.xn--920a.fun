"use client";

import { Streamdown } from "streamdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import "katex/dist/katex.min.css";

interface MarkdownLatexRendererProps {
  content: string;
  mode?: "streaming" | "static";
}

const MarkdownLatexRenderer = ({ content, mode = "streaming" }: MarkdownLatexRendererProps) => {
  return (
    <Streamdown 
      mode={mode}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
    >
      {content}
    </Streamdown>
  );
};

export default MarkdownLatexRenderer;
