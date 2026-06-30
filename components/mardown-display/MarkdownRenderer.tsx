"use client";
import React from "react";
import dynamic from "next/dynamic";
import remarkGfm from "remark-gfm";
import { cn } from "@/styles/themes/utils";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";
import { parseMarkdownTable } from "@/components/mardown-display/markdown-classification/processors/bock-processors/parse-markdown-table";
import MarkdownTable from "./tables/TableWithSeparatedControls";
import { InlineCopyButton } from "@/components/matrx/buttons/MarkdownCopyButton";

import type { Components } from "react-markdown";

const ReactMarkdown = dynamic(() => import("react-markdown"), {
  ssr: false,
});

interface MarkdownRendererProps {
  content: string;
  type?: "flashcard" | "message" | "markdown";
  fontSize?: number;
  role?: "user" | "assistant";
  className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  type = "markdown",
  fontSize = 16,
  role = "assistant",
  className,
}) => {
  const tableData = parseMarkdownTable(content);

  const components = {
    p: ({ node, ...props }) => (
      <p
        style={{ fontSize: `${fontSize}px` }}
        className="mb-3 font-sans tracking-wide leading-relaxed"
        {...props}
      />
    ),
    ul: ({ node, ...props }) => (
      <ul
        style={{ fontSize: `${fontSize}px` }}
        className="matrx-md-ul pl-5 mb-3 leading-relaxed"
        {...props}
      />
    ),
    ol: ({ node, ...props }) => (
      <ol
        style={{ fontSize: `${fontSize}px` }}
        className="matrx-md-ol pl-5 mb-3 leading-relaxed"
        {...props}
      />
    ),
    li: ({ node, children, ordered, index, ...props }: any) => {
      if (ordered && typeof index === "number") {
        return (
          <li className="mb-0" style={{ fontSize: `${fontSize}px` }} {...props}>
            <span className="inline-block w-full">
              <span className="inline-block w-3 mr-2 text-right">
                {index + 1}.
              </span>
              <span className="inline-block w-[calc(100%-1.5rem)]">
                {children}
              </span>
            </span>
          </li>
        );
      }
      return (
        <li className="mb-0" style={{ fontSize: `${fontSize}px` }} {...props}>
          {children}
        </li>
      );
    },
    a: ({ node, ...props }) => (
      <a
        className="text-blue-500 underline font-medium"
        style={{ fontSize: `${fontSize}px` }}
        {...props}
      />
    ),
    h1: ({ node, ...props }) => (
      <h1
        className="text-2xl font-medium mb-4 font-heading"
        style={{ fontSize: `${Math.max(fontSize + 8, 24)}px` }}
        {...props}
      />
    ),
    h2: ({ node, ...props }) => (
      <h2
        className="text-xl font-medium mb-3 font-heading"
        style={{ fontSize: `${Math.max(fontSize + 6, 20)}px` }}
        {...props}
      />
    ),
    h3: ({ node, ...props }) => (
      <h3
        className="text-lg font-medium mb-3 font-heading"
        style={{ fontSize: `${Math.max(fontSize + 4, 18)}px` }}
        {...props}
      />
    ),
    h4: ({ node, ...props }) => (
      <h4
        className="text-base font-medium mb-2 font-heading"
        style={{ fontSize: `${Math.max(fontSize + 2, 16)}px` }}
        {...props}
      />
    ),
    h5: ({ node, ...props }) => (
      <h5
        className="text-sm font-medium mb-2 font-heading"
        style={{ fontSize: `${Math.max(fontSize, 14)}px` }}
        {...props}
      />
    ),
    h6: ({ node, ...props }) => (
      <h6
        className="text-xs font-medium mb-2 font-heading"
        style={{ fontSize: `${Math.max(fontSize - 2, 12)}px` }}
        {...props}
      />
    ),
    blockquote: ({ node, ...props }) => (
      <blockquote
        className="border-l-4 border-blue-500 pl-4 py-2 my-4 bg-neutral-50 dark:bg-neutral-800/50 italic"
        style={{ fontSize: `${fontSize}px` }}
        {...props}
      />
    ),
    strong: ({ node, ...props }) => (
      <strong className="font-semibold" {...props} />
    ),
    em: ({ node, ...props }) => <em className="italic" {...props} />,
    del: ({ node, ...props }) => (
      <del className="line-through opacity-75" {...props} />
    ),
    img: ({ node, alt, src, ...props }) => (
      <img
        className="max-w-full h-auto rounded-lg my-4 border border-neutral-200 dark:border-neutral-700"
        alt={alt || ""}
        src={src || ""}
        {...props}
      />
    ),
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : "";
      if (!inline && language) {
        // DATA CONTRACT: render the code exactly as received. The previous
        // `.replace(/\n$/, "")` stripped trailing newlines, which breaks
        // round-tripping (user edit → save → re-render would lose the
        // final newline) and is visibly wrong for languages where the
        // trailing newline is significant.
        return (
          <CodeBlock
            code={String(children)}
            language={language}
            fontSize={fontSize}
            className="my-4"
            onCodeChange={(newCode) => {
              // Handle code changes if needed
              console.log("Code updated:", newCode);
            }}
          />
        );
      }
      return (
        <code
          className={cn(
            "px-1.5 py-0.5 rounded font-mono text-sm",
            "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
            className,
          )}
          style={{ fontSize: `${Math.max(fontSize - 2, 12)}px` }}
          {...props}
        >
          {children}
        </code>
      );
    },
    pre: ({ node, children, ...props }) => (
      <pre className="my-4" {...props}>
        {children}
      </pre>
    ),
    hr: ({ node, ...props }) => (
      <hr
        className="my-2 border-0 h-px bg-neutral-300 dark:bg-neutral-600"
        {...props}
      />
    ),
    table: () => {
      if (!tableData?.markdown) return null;
      return (
        <div className="border-2 border-border">
          <MarkdownTable data={tableData.markdown} />
        </div>
      );
    },
    thead: () => null,
    tbody: () => null,
    tr: () => null,
    th: () => null,
    td: () => null,
  } as Components;

  const containerStyles = cn(
    "font-sans text-base antialiased leading-relaxed tracking-wide h-full w-full",
    type === "flashcard"
      ? "text-left mb-4 text-white"
      : `inline-block p-3 rounded-lg w-full ${
          role === "user"
            ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
            : "bg-inherit text-inherit"
        }`,
    className,
  );

  return (
    <div
      className={`${type === "message" ? "mb-4 w-full" : ""} ${role === "user" ? "text-right" : "text-left"}`}
    >
      <div className={containerStyles + " relative"}>
        <InlineCopyButton
          markdownContent={content}
          position="top-right"
          className="mt-1 mr-1"
          isMarkdown={true}
        />
        <div className="text-base leading-relaxed tracking-wide h-full w-full">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

export default MarkdownRenderer;
