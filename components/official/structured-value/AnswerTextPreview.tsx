"use client";

// components/official/structured-value/AnswerTextPreview.tsx
//
// THE COMPACT PLAIN-TEXT PREVIEW of answer text (a toast line, a list row, a
// transcript bubble) — the small sibling of `AnswerValueView` for slots too
// tight for the full renderer. A `__kind` region is never printed as JSON
// (Arman, 2026-09-30): a complete kind reads as its markdown, a kind still
// arriving is cut and shown as its loader line. Kindless text is unchanged.

import { Loader2 } from "lucide-react";
import { kindTextPreview } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { humanizeKind } from "@/features/content-ir/kinds/kind-markdown-utils";
import { cn } from "@/lib/utils";

export interface AnswerTextPreviewProps {
  text: string | null | undefined;
  /** Classes for the text paragraph (clamp, size, colour). */
  className?: string;
}

export function AnswerTextPreview({ text, className }: AnswerTextPreviewProps) {
  const preview = kindTextPreview(text);
  const arriving = preview.pendingKind !== null || preview.pendingUnnamed;
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
    </>
  );
}
