"use client";

import React, { useState, lazy, Suspense } from "react";
import { cn } from "@/styles/themes/utils";
import { Copy, Check, Eye, Code2, FileText } from "lucide-react";
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";

const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);

interface MarkdownPreviewBlockProps {
  content: string;
  className?: string;
  isStreamActive?: boolean;
  onCodeChange?: (newCode: string) => void;
}

const MarkdownPreviewBlock: React.FC<MarkdownPreviewBlockProps> = ({
  content,
  className,
  isStreamActive,
  onCodeChange,
}) => {
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "my-3 rounded-lg border border-border bg-card overflow-hidden",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-xs font-mono font-semibold text-blue-600 dark:text-blue-400">
            Markdown
          </span>
        </div>
        <div className="flex items-center gap-1">
          {/* Preview / Source toggle */}
          <div className="flex items-center rounded-md border border-border/50 overflow-hidden mr-1">
            <button
              onClick={() => setMode("preview")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-xs transition-colors",
                mode === "preview"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Eye className="w-3 h-3" />
              Preview
            </button>
            <button
              onClick={() => setMode("source")}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-xs transition-colors border-l border-border/50",
                mode === "source"
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Code2 className="w-3 h-3" />
              Source
            </button>
          </div>
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-green-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {mode === "preview" ? (
        <div className="px-4 py-3">
          <BasicMarkdownContent
            content={content}
            isStreamActive={isStreamActive}
            showCopyButton={false}
          />
        </div>
      ) : (
        <Suspense fallback={<MatrxMiniLoader />}>
          <CodeBlock
            code={content}
            language="markdown"
            fontSize={14}
            isStreamActive={isStreamActive}
            onCodeChange={onCodeChange}
          />
        </Suspense>
      )}
    </div>
  );
};

export default MarkdownPreviewBlock;
