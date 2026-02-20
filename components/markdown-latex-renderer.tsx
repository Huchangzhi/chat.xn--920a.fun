"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

interface MarkdownLatexRendererProps {
  content: string;
  mode?: "streaming" | "static";
}

const MarkdownLatexRenderer = ({ content, mode = "streaming" }: MarkdownLatexRendererProps) => {
  return (
    <div className="markdown-content prose prose-sm max-w-none dark:prose-invert">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={{
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse border border-border" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="border border-border bg-secondary px-3 py-2 text-left" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="border border-border px-3 py-2" {...props} />
          ),
          pre: ({ node, ...props }) => (
            <pre className="bg-[#0d1117] rounded-md p-4 overflow-x-auto" {...props} />
          ),
          code: ({ node, inline, ...props }: any) => (
            inline ? (
              <code className="bg-secondary px-1.5 py-0.5 rounded text-sm" {...props} />
            ) : (
              <code {...props} />
            )
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownLatexRenderer;
