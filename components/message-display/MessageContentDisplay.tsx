"use client";

import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { TableWrapper, LinkWrapper } from ".";
import dynamic from "next/dynamic";
import type { MarkdownWithPluginsProps } from "@/components/message-display/MarkdownWithPlugins";
import type { Components } from "react-markdown";

const CodeBlock = dynamic(
  () => import("../../features/code-editor/components/code-block/CodeBlock"),
  {
    ssr: false,
  },
);

// Dynamically import ReactMarkdown as a complete component with plugins
const MarkdownWithPlugins = dynamic<MarkdownWithPluginsProps>(
  () => import("@/components/message-display/MarkdownWithPlugins"),
  {
    ssr: false,
    loading: () => <div className="text-foreground">Loading...</div>,
  },
);

interface MessageContentDisplayProps {
  content: string;
  role: "assistant" | "user";
}

const MessageContentDisplay = ({
  content,
  role,
}: MessageContentDisplayProps) => {
  const [mounted, setMounted] = useState(false);
  const hasSpecialContent =
    content.includes("```") ||
    content.includes("|---|") ||
    content.includes("#");

  // Only render markdown content on the client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Markdown components configuration
  const MarkdownComponents = {
    code: ({ node, inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || "");
      const code = String(children).replace(/\n$/, "");

      if (inline) {
        return (
          <code className="px-1.5 py-0.5 rounded-md bg-muted font-mono text-md text-foreground">
            {children}
          </code>
        );
      }

      // Get language from match, default to 'typescript' if none specified
      const language = match ? match[1] : "typescript";

      return (
        <CodeBlock
          code={code}
          language={language}
          inline={false}
          className={className}
          {...props}
        />
      );
    },
    p: ({ children }: any) => {
      // Check if children contains a block element
      const childrenArray = React.Children.toArray(children);
      const isBlockElement = childrenArray.some(
        (child: any) => child?.type === CodeBlock,
      );

      if (isBlockElement) {
        return <>{children}</>;
      }

      return <div className="text-foreground">{children}</div>;
    },
    table: TableWrapper,
    a: LinkWrapper as any,
  } as Components;

  // Client-side rendering of markdown content
  const MarkdownContent = () => {
    if (!mounted) return <div className="text-foreground">Loading...</div>;

    return (
      <MarkdownWithPlugins content={content} components={MarkdownComponents} />
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "prose prose-sm max-w-none",
        "prose-headings:font-semibold prose-headings:mb-3 prose-headings:mt-6",
        "prose-p:my-2 prose-p:leading-relaxed prose-p:text-foreground",
        "prose-pre:my-0 prose-pre:bg-muted/50",
        "prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-foreground",
        "prose-ul:my-2 prose-li:my-0.5 prose-li:text-foreground",
        "prose-table:border prose-table:border-border",
        "prose-th:bg-muted/50 prose-th:p-2 prose-th:text-left prose-th:text-foreground",
        "prose-td:p-2 prose-td:border-t prose-td:border-border prose-td:text-foreground",
        "dark:prose-invert text-sm",
        role === "assistant" ? "prose-primary" : "prose-neutral",
      )}
    >
      {!mounted ? (
        <div className="text-foreground">Loading...</div>
      ) : hasSpecialContent ? (
        <Tabs defaultValue="rendered" className="w-full">
          <TabsList className="mb-2">
            <TabsTrigger value="rendered">Rendered</TabsTrigger>
            <TabsTrigger value="raw">Raw</TabsTrigger>
          </TabsList>
          <TabsContent value="rendered" className="mt-0">
            <MarkdownContent />
          </TabsContent>
          <TabsContent value="raw" className="mt-0">
            <pre className="p-4 bg-muted/50 rounded-lg overflow-x-auto text-sm">
              <code className="text-foreground">{content}</code>
            </pre>
          </TabsContent>
        </Tabs>
      ) : (
        <MarkdownContent />
      )}
    </motion.div>
  );
};

export default MessageContentDisplay;
