"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { toast } from "@/lib/toast";
import React, { useState, lazy, Suspense } from "react";
import { cn } from "@/styles/themes/utils";
import { Copy, Check, Eye, Code2, FileText } from "lucide-react";
import { NestedRichContent } from "@/components/rich-content/standard/NestedRichContent";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { Button } from "@ai-matrx/design-system/controls";

const CodeBlock = lazy(
  () => import("@/features/code-editor/components/code-block/CodeBlock"),
);

interface MarkdownPreviewBlockProps {
  content: string;
  className?: string;
  isStreamActive?: boolean;
  onCodeChange?: (newCode: string) => void;
  /**
   * The fenced document ALREADY RENDERED by a static root (the server level or
   * the SSR'd static leaf — standard/static-standard.tsx), so its prose is in
   * the server HTML. Used for the Preview view while the block is not
   * streaming; without it the preview renders client-side through
   * NestedRichContent. Both are the same core at the same depth.
   */
  renderedPreview?: React.ReactNode;
}

const MarkdownPreviewBlock: React.FC<MarkdownPreviewBlockProps> = ({
  content,
  className,
  isStreamActive,
  onCodeChange,
  renderedPreview,
}) => {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  const [mode, setMode] = useState<"preview" | "source">("preview");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyText(content);
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
            <Button variant="quiet" pressed={mode === "preview"} icon={<Eye />} onClick={() => setMode("preview")}>
              Preview
            </Button>
            <Button variant="quiet" pressed={mode === "source"} icon={<Code2 />} onClick={() => setMode("source")}>
              Source
            </Button>
          </div>
          <Button variant="quiet" icon={copied ? (
              <Check />
            ) : (
              <Copy />
            )} glyphTone={copied ? "success" : undefined} onClick={handleCopy} aria-label="Copy" />
        </div>
      </div>

      {/* Content */}
      {mode === "preview" ? (
        <div className="px-4 py-3">
          {/* The fenced document renders through the same core, one level
              deeper — its own ```code fences, tables, math and sections
              render as themselves (depth-bounded; streaming-safe). */}
          {renderedPreview && !isStreamActive ? (
            renderedPreview
          ) : (
            <NestedRichContent source={content} isStreaming={isStreamActive} />
          )}
        </div>
      ) : (
        <Suspense fallback={<MatrxMiniLoader />}>
          <CodeBlock showSource
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
