"use client";

/**
 * IngestedSourcesBlock — THE renderer for the `ingested_sources` kind. There
 * is no other.
 *
 * 🚨 THE CANONICAL COMPONENT LAW (see `features/content-ir/FEATURE.md`).
 * A registered shape gets exactly ONE component: this one renders an intake in
 * the workflow run surface, in the live run window, and in chat — the same
 * pixels everywhere. Need one part on its own? Import `IngestedSourceRow` or
 * `IngestedSourcesShortfall`. Do not build a second intake view.
 *
 * WHAT IT ANSWERS, in the person's terms: what did we take in, what was each
 * thing, how much material came out of it, and can I see the text? The raw
 * shape's `chunk_id` / `content_hash` / `source_offset_end` answer none of
 * those and are retrieval plumbing — they stay out of the reader's way (the
 * regrouping that makes this possible is `groupChunksBySource`, in the kind
 * module, and is never re-derived here).
 *
 * 🚨 A SHORTFALL IS NEVER QUIET. `sources_failed` and `errors` exist so a pack
 * built from 1 of 3 uploads cannot pose as complete; when they are non-zero
 * this renders a real warning above everything else, with the reasons.
 *
 * Streaming-first: an intake with no chunks yet is a NORMAL mid-stream state.
 */

import { createElement, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  FileText,
  Globe,
  Loader2,
  Notebook,
  Paperclip,
  Type,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  coerceIngestedSources,
  type IngestedSourceData,
  type IngestedSourcesData,
} from "@/features/content-ir/kinds/ingested-sources";
import { cn } from "@/lib/utils";

/**
 * Accepts either the bridge output (already coerced, with `isComplete`) or a
 * raw value object — persisted surfaces hand the block the stored output.
 */
export function readIngestedSourcesData(
  serverData: unknown,
): IngestedSourcesData {
  if (
    typeof serverData === "object" &&
    serverData !== null &&
    "sources" in serverData
  ) {
    const data = serverData as IngestedSourcesData;
    return { ...data, isComplete: data.isComplete !== false };
  }
  return coerceIngestedSources(serverData);
}

const SOURCE_ICON: Record<string, LucideIcon> = {
  plain_text: Type,
  user_note: Notebook,
  pdf: FileText,
  web_page: Globe,
  html: Globe,
  text: FileText,
  markdown: FileText,
  docx: FileText,
  transcript: FileText,
};

function sourceIcon(kind: string, className: string) {
  return createElement(SOURCE_ICON[kind] ?? Paperclip, { className });
}

/** Characters are the honest unit here, but words are the readable one. */
function describeSize(chars: number): string {
  const words = Math.round(chars / 5.5);
  if (words < 1) return "empty";
  return `${words.toLocaleString()} ${words === 1 ? "word" : "words"}`;
}

/** The loud half: what was handed in that we could not read, and why. */
export function IngestedSourcesShortfall({
  data,
}: {
  data: IngestedSourcesData;
}) {
  if (data.sourcesFailed <= 0 && data.errors.length === 0) return null;

  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {data.sourcesFailed > 0
          ? `${data.sourcesFailed} of ${data.sourcesRequested} ${
              data.sourcesRequested === 1 ? "source" : "sources"
            } could not be read`
          : "Something went wrong reading your materials"}
      </p>
      {data.errors.length > 0 ? (
        <ul className="mt-1.5 space-y-1 pl-5.5">
          {data.errors.map((error, i) => (
            <li key={i} className="text-xs leading-relaxed text-destructive/90">
              {error}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1.5 text-xs text-muted-foreground">
        Everything below was built from what we could read.
      </p>
    </div>
  );
}

/** One source: what it was, how much came out of it, and its text on demand. */
export function IngestedSourceRow({ source }: { source: IngestedSourceData }) {
  const [open, setOpen] = useState(false);
  const hasText = source.text !== "";

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasText}
        className={cn(
          "flex w-full items-center gap-2.5 p-2.5 text-left",
          hasText && "hover:bg-accent/50",
        )}
      >
        {sourceIcon(source.kind, "h-4 w-4 shrink-0 text-muted-foreground")}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">
            {source.label}
          </span>
          <span className="block text-xs text-muted-foreground">
            {source.kindLabel} · {describeSize(source.chars)}
          </span>
        </span>
        {hasText ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            {open ? "Hide" : "Read"}
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            />
          </span>
        ) : null}
      </button>

      {open && hasText ? (
        <p className="max-h-80 overflow-y-auto whitespace-pre-wrap border-t border-border px-3 py-2.5 text-sm leading-relaxed text-muted-foreground">
          {source.text}
        </p>
      ) : null}
    </div>
  );
}

export interface IngestedSourcesBlockProps {
  serverData?: unknown;
  className?: string;
}

export default function IngestedSourcesBlock({
  serverData,
  className,
}: IngestedSourcesBlockProps) {
  const data = readIngestedSourcesData(serverData);
  const count = data.sources.length;

  if (count === 0 && data.isComplete && data.errors.length === 0) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        No readable material came out of what was handed in.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2.5", className)}>
      <IngestedSourcesShortfall data={data} />

      {count > 0 ? (
        <p className="text-xs text-muted-foreground">
          We read {count} {count === 1 ? "source" : "sources"} ·{" "}
          {describeSize(data.totalChars)} of material
        </p>
      ) : null}

      <div className="space-y-1.5">
        {data.sources.map((source) => (
          <IngestedSourceRow key={source.key} source={source} />
        ))}
      </div>

      {!data.isComplete ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          Still reading your materials
        </p>
      ) : null}
    </div>
  );
}
