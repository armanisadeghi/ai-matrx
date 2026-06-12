"use client";

// features/podcasts/studio/components/SourceSummaryPanel.tsx
//
// Always-visible panel showing the SOURCE a run was created from — the topic,
// pasted notes, or file(s) the user fed in. Surfaced on the run detail page for
// EVERY state (including interrupted/failed) so the input is never lost and a
// run can always be understood or re-run.

import { FileText, Link2, Type } from "lucide-react";
import type { RunDetail } from "@/features/podcasts/studio/runs/run-types";

function inputTypeLabel(kind: string | null): string {
  switch (kind) {
    case "topic":
      return "Topic";
    case "file_url":
      return "File";
    case "full_content":
      return "Full notes";
    case "partial_content":
      return "Notes";
    default:
      return "Source";
  }
}

export function SourceSummaryPanel({ detail }: { detail: RunDetail }) {
  const req = detail.request ?? {};
  const inputData = typeof req.input_data === "string" ? req.input_data.trim() : "";
  const fileUrls = Array.isArray(req.file_urls)
    ? (req.file_urls as unknown[]).filter((u): u is string => typeof u === "string")
    : detail.source.file_urls;
  const kind = detail.source.input_data_type;

  const hasContent = inputData.length > 0 || fileUrls.length > 0;
  if (!hasContent) return null;

  const Icon = kind === "file_url" ? FileText : kind === "topic" ? Type : FileText;

  return (
    <details className="group rounded-2xl border border-border bg-card/60 p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        Source
        <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {inputTypeLabel(kind)}
        </span>
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">
          Show
        </span>
        <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">
          Hide
        </span>
      </summary>

      <div className="mt-3 space-y-2">
        {inputData && (
          <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm leading-relaxed text-foreground/90">
            {inputData}
          </div>
        )}
        {fileUrls.map((url) => (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm text-primary hover:underline"
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{url}</span>
          </a>
        ))}
      </div>
    </details>
  );
}
