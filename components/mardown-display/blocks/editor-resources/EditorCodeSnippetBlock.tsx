"use client";

/**
 * EditorCodeSnippetBlock — chip rendering for `<editor_code_snippet>` tags.
 *
 * Hover reveals the full snippet with monospace formatting; the chip itself
 * shows file:range so the user can scan a message at a glance.
 */

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
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-900/50 text-cyan-700 dark:text-cyan-300 cursor-default align-middle">
          <Code2 className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono truncate max-w-[20ch]">{label}</span>
        </span>
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
