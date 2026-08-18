"use client";

// features/vision-interview/components/DeliverablePane.tsx
//
// One final deliverable (v2 §13.3): the Vision document, the Requirements
// document, or the cleaned Transcript — server-written markdown on the
// session row (`vision_document` / `requirements_document` /
// `cleaned_transcript`), rendered read-only through the canonical markdown
// front door (<RichDocument>) with the same header affordances the living
// document pane carries: copy + download. Never a bespoke renderer.

import { useState } from "react";
import { Check, Copy, Download, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { downloadBlob } from "@/utils/file-operations/utils";
import { RichDocument } from "@/features/rich-document/RichDocument";

interface DeliverablePaneProps {
  label: string;
  icon: LucideIcon;
  /** The deliverable's markdown (already known non-empty by the caller). */
  content: string;
  /** Download filename (".md" appended here). */
  filename: string;
  /** When the interview was finalized, for the header meta line. */
  finalizedAt: string | null;
}

export function DeliverablePane({
  label,
  icon: Icon,
  content,
  filename,
  finalizedAt,
}: DeliverablePaneProps) {
  const [copied, setCopied] = useState(false);

  const copyDoc = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 900);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const download = () => {
    const ok = downloadBlob(
      new Blob([content], { type: "text/markdown;charset=utf-8" }),
      `${filename}.md`,
    );
    if (!ok) toast.error("Could not download the document");
  };

  const finalizedLabel = finalizedAt
    ? new Date(finalizedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 py-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {finalizedLabel && (
          <span className="text-[11px] text-muted-foreground">
            finalized {finalizedLabel}
          </span>
        )}
        <span className="ml-auto" />
        <button
          type="button"
          onClick={() => void copyDoc()}
          aria-label={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
          title="Copy"
          className={cn(
            "flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
            copied && "text-green-500 hover:text-green-500",
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={download}
          aria-label={`Download ${label.toLowerCase()} as markdown`}
          title="Download (.md)"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <RichDocument
          content={content}
          source={{ type: "raw" }}
          hideCopyButton
          contentClassName="text-sm"
        />
      </div>
    </div>
  );
}
