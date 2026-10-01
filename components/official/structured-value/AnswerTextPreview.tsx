"use client";

// components/official/structured-value/AnswerTextPreview.tsx
//
// THE COMPACT PLAIN-TEXT PREVIEW of answer text (a toast line, a list row, a
// transcript bubble) — the small sibling of `AnswerValueView` for slots too
// tight for the full renderer. A `__kind` region is never printed as JSON
// (Arman, 2026-09-30): a complete kind reads as its markdown, a kind still
// arriving is cut and shown as its loader line while the caller says the
// stream is live; once it is over, a kind that never completed shows its
// one-line broken state. Kindless text is unchanged.

import { AlertTriangle, Loader2 } from "lucide-react";
import {
  kindTextPreview,
  kindTextToMarkdown,
} from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { humanizeKind } from "@/features/content-ir/kinds/kind-markdown-utils";
import { cn } from "@/lib/utils";

export interface AnswerTextPreviewProps {
  text: string | null | undefined;
  /** Classes for the text paragraph (clamp, size, colour). */
  className?: string;
  /**
   * True while the answer is still streaming. Required: only the caller knows,
   * and an unfinished kind after the stream ends is broken, not loading.
   */
  streaming: boolean;
}

/** The one-line broken state of a kind that never completed (≤60 chars). */
export function unfinishedKindLabel(kind: string | null): string {
  return kind ? `${humanizeKind(kind)} did not finish` : "Result did not finish";
}

/**
 * The same preview as ONE plain string, for slots that hold only text (a
 * truncated row, spoken transcript): the loader word while streaming, the
 * broken line once the stream is over.
 */
export function answerPreviewText(
  text: string | null | undefined,
  streaming: boolean,
): string {
  const preview = kindTextPreview(text);
  const unfinished = preview.pendingKind !== null || preview.pendingUnnamed;
  if (!unfinished) return preview.text;
  const tail = streaming
    ? `${preview.pendingKind ? humanizeKind(preview.pendingKind) : "Building"}…`
    : unfinishedKindLabel(preview.pendingKind);
  return [preview.text, tail].filter(Boolean).join(" ");
}

/**
 * The text an EDITABLE prose field shows while a stream fills it: settled →
 * the kind's markdown (what a person edits); streaming → the compact preview
 * (an arriving kind is its loader word, never half-arrived JSON).
 */
export function answerFieldText(text: string | null | undefined, streaming: boolean): string {
  return streaming ? answerPreviewText(text, true) : kindTextToMarkdown(text);
}

export function AnswerTextPreview({
  text,
  className,
  streaming,
}: AnswerTextPreviewProps) {
  const preview = kindTextPreview(text);
  const unfinished = preview.pendingKind !== null || preview.pendingUnnamed;
  const arriving = unfinished && streaming;
  const broken = unfinished && !streaming;
  return (
    <>
      {preview.text ? <p className={className}>{preview.text}</p> : null}
      {arriving ? (
        <span
          data-kind-loader={preview.pendingKind ?? ""}
          className={cn(
            "flex items-center gap-1.5 text-xs text-muted-foreground",
            preview.text && "mt-1",
          )}
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          {preview.pendingKind ? humanizeKind(preview.pendingKind) : "Building"}…
        </span>
      ) : null}
      {broken ? (
        <span
          data-kind-broken={preview.pendingKind ?? ""}
          className={cn(
            "flex items-center gap-1.5 text-xs text-destructive",
            preview.text && "mt-1",
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          {unfinishedKindLabel(preview.pendingKind)}
        </span>
      ) : null}
    </>
  );
}
