"use client";

/**
 * EditorCodeSnippetBlock — chip rendering for `<editor_code_snippet>` tags.
 *
 * Hover reveals the full snippet with monospace formatting; the chip itself
 * shows file:range so the user can scan a message at a glance.
 */

import { Chip } from "@ai-matrx/design-system/controls";
import React from "react";
import { Code2 } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface EditorCodeSnippetBlockProps {
  content: string;
  metadata?: Record<string, unknown>;
}

function basename(path: string): string {
  const i = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return i === -1 ? path : path.slice(i + 1);
}

export default function EditorCodeSnippetBlock({
  content,
  metadata,
}: EditorCodeSnippetBlockProps) {
  const file = typeof metadata?.file === "string" ? metadata.file : "";
  const range = typeof metadata?.range === "string" ? metadata.range : "";
  const language = typeof metadata?.language === "string" ? metadata.language : "plaintext";

  const label = `${file ? basename(file) : "Snippet"}${range ? `:${range.replace(/^L?(\d+)-L?(\d+)$/, "$1-$2")}` : ""}`;
  const snippet = content.trim();

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Chip tone="cyan" icon={<Code2 />} label={label} />
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-[28rem] max-w-[90vw] p-0 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/50">
          <Code2 className="w-4 h-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
          <span className="text-xs font-mono text-muted-foreground truncate">
            {file}
            {range ? ` · ${range}` : ""}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">
            {language}
          </span>
        </div>
        <pre className="text-xs font-mono bg-background p-3 overflow-x-auto max-h-72 leading-snug">
          {snippet}
        </pre>
      </HoverCardContent>
    </HoverCard>
  );
}
