/**
 * SEARCH/REPLACE Diff Renderer
 *
 * Handles the streaming illusion for SEARCH/REPLACE blocks:
 * 1. Buffer SEARCH silently (show loading)
 * 2. Stream REPLACE as code
 * 3. Switch to diff view when complete
 *
 * Features:
 * - Collapsed preview (4 lines) when complete
 * - Diff statistics (+/- counts)
 * - Smooth expand/collapse with fade effect
 */

"use client";

import React, { useEffect, useMemo, useRef } from "react";
import {
  generateUnifiedDiff,
  DiffLine,
} from "@/features/code-editor/utils/generateDiff";
import { DiffView } from "@/features/code-editor/components/DiffView";
import CodeBlock from "@/features/code-editor/components/code-block/CodeBlock";
import { DiffLoadingIndicator } from "../DiffLoadingIndicator";
import { DiffCollapsible } from "../DiffCollapsible";
import { GitCompare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { Prism as SyntaxHighlighterBase } from "react-syntax-highlighter";
import {
  vscDarkPlus,
  vs,
} from "react-syntax-highlighter/dist/cjs/styles/prism";

// Type assertion for React 19 compatibility
const SyntaxHighlighter = SyntaxHighlighterBase as any;

interface SearchReplaceData {
  search: string;
  replace: string;
  searchComplete: boolean;
  replaceComplete: boolean;
  isComplete: boolean;
}

interface SearchReplaceDiffRendererProps {
  data: SearchReplaceData;
  language?: string;
  isStreamActive?: boolean;
  className?: string;
}

/**
 * Render a mini preview of the diff (first N lines)
 * Used in collapsed state
 */
const DiffPreview: React.FC<{
  lines: DiffLine[];
  language: string;
  maxLines?: number;
}> = ({ lines, language, maxLines = 4 }) => {
  const mode = useThemeMode();
  const previewLines = lines.slice(0, maxLines);

  const getDiffLineStyle = (type: DiffLine["type"]) => {
    if (type === "added") {
      return mode === "dark"
        ? "bg-green-900/60 border-l-4 border-green-500"
        : "bg-green-100 border-l-4 border-green-600";
    }
    if (type === "removed") {
      return mode === "dark"
        ? "bg-red-900/60 border-l-4 border-red-500"
        : "bg-red-100 border-l-4 border-red-600";
    }
    return mode === "dark" ? "bg-transparent" : "bg-transparent";
  };

  const getDiffLinePrefix = (type: DiffLine["type"]) => {
    if (type === "added") return "+ ";
    if (type === "removed") return "- ";
    return "  ";
  };

  const getDiffLinePrefixColor = (type: DiffLine["type"]) => {
    if (type === "added") {
      return mode === "dark" ? "text-green-400" : "text-green-700";
    }
    if (type === "removed") {
      return mode === "dark" ? "text-red-400" : "text-red-700";
    }
    return mode === "dark" ? "text-gray-500" : "text-gray-600";
  };

  return (
    <div
      className={cn(
        "font-mono text-xs",
        mode === "dark" ? "bg-zinc-900" : "bg-white",
      )}
    >
      {previewLines.map((line, index) => (
        <div
          key={index}
          className={cn("flex items-center", getDiffLineStyle(line.type))}
        >
          <div
            className={cn(
              "shrink-0 w-10 text-right pr-2 select-none",
              mode === "dark" ? "text-gray-500" : "text-gray-400",
            )}
          >
            {line.lineNumber}
          </div>
          <div
            className={cn(
              "shrink-0 w-4 select-none font-bold",
              getDiffLinePrefixColor(line.type),
            )}
          >
            {getDiffLinePrefix(line.type)}
          </div>
          <div className="flex-1 pr-2 overflow-x-auto">
            <SyntaxHighlighter
              language={language}
              style={mode === "dark" ? vscDarkPlus : vs}
              PreTag="span"
              customStyle={{
                margin: 0,
                padding: 0,
                background: "transparent",
                fontSize: "inherit",
                fontFamily: "inherit",
                lineHeight: "1.2",
              }}
              codeTagProps={{
                style: {
                  background: "transparent",
                  fontFamily: "inherit",
                  lineHeight: "1.2",
                },
              }}
            >
              {line.content || " "}
            </SyntaxHighlighter>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Efficiently render SEARCH/REPLACE diff with streaming support
 */
export const SearchReplaceDiffRenderer: React.FC<
  SearchReplaceDiffRendererProps
> = ({ data, language = "typescript", isStreamActive = false, className }) => {
  const { search, replace, searchComplete, replaceComplete, isComplete } = data;

  // Memoize diff generation - only when both are complete
  const diffData = useMemo(() => {
    if (!isComplete || !search || !replace) return null;
    return generateUnifiedDiff(search, replace);
  }, [isComplete, search, replace]);

  // Auto-scroll the streaming preview to the bottom as new code arrives,
  // so the user always sees the freshest line being written. The container
  // is height-capped to ~3-5 lines of code (Phase 2 only).
  const streamScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = streamScrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [replace]);

  // Phase 1: Buffering SEARCH (show loading)
  if (!searchComplete) {
    return (
      <div
        className={cn(
          "rounded-lg border border-neutral-200 dark:border-neutral-700 bg-muted/30",
          className,
        )}
      >
        <DiffLoadingIndicator message="Analyzing code..." />
      </div>
    );
  }

  // Phase 2: SEARCH complete, streaming REPLACE (show as code)
  if (searchComplete && !replaceComplete) {
    return (
      <div className={cn("space-y-2", className)}>
        {/* Show REPLACE streaming as code */}
        {replace && (
          <div
            ref={streamScrollRef}
            className="max-h-[140px] overflow-y-auto overscroll-contain"
          >
            <CodeBlock
              code={replace}
              language={language}
              showLineNumbers={true}
              isStreamActive={isStreamActive}
            />
          </div>
        )}
      </div>
    );
  }

  // Phase 3: Both complete - show diff view with collapsed preview
  if (diffData) {
    return (
      <DiffCollapsible
        icon={<GitCompare className="h-3.5 w-3.5 text-emerald-500" />}
        title="Code Updates"
        initialOpen={false}
        className={className}
        additions={diffData.additions}
        deletions={diffData.deletions}
        showPreview={true}
        previewContent={
          <DiffPreview
            lines={diffData.lines}
            language={language}
            maxLines={4}
          />
        }
      >
        <DiffView
          originalCode={search}
          modifiedCode={replace}
          language={language}
          showLineNumbers={true}
        />
      </DiffCollapsible>
    );
  }

  // Fallback: shouldn't reach here, but show what we have
  return (
    <div
      className={cn(
        "rounded-lg border border-neutral-200 dark:border-neutral-700",
        className,
      )}
    >
      <CodeBlock
        code={replace || search || "// No content"}
        language={language}
        showLineNumbers={true}
      />
    </div>
  );
};
