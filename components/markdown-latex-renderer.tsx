"use client";

import { Streamdown } from "streamdown";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface MarkdownLatexRendererProps {
  content: string;
  mode?: "streaming" | "static";
}

const MarkdownLatexRenderer = ({ content, mode = "streaming" }: MarkdownLatexRendererProps) => {
  return (
    <Streamdown 
      mode={mode}
      rehypePlugins={[rehypeKatex]}
    >
      {content}
    </Streamdown>
  );
};

export default MarkdownLatexRenderer;
