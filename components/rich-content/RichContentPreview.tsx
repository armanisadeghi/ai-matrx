"use client";

// ─────────────────────────────────────────────────────────────────────────
// <RichContentPreview source lines> — a clamped one-to-three line preview of
// markdown text (card descriptions, table-cell previews). It is the inline
// level of <RichContent> — bold, links, code and math render — cut to the
// first lines of the source and clamped by CSS. It never strips markdown with
// regexes (the cleanMarkdownPreview pattern the legacy guard bans).
//
// Links inside the preview render as their text (the card is usually itself a
// link or button). The source is cut at a line boundary, never mid-line.
// ─────────────────────────────────────────────────────────────────────────

import { cn } from "@/lib/utils";
import { RichContent } from "./RichContent";
import { inlineKindText } from "@/features/content-ir/surfaces/kind-one-line";

const CLAMP: Record<1 | 2 | 3 | 4 | 6, string> = {
  1: "truncate",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  6: "line-clamp-6",
};

/** Cut at a line boundary: the first non-empty lines, bounded by characters. */
export function previewSource(source: string, lines: number, maxChars: number): string {
  const picked: string[] = [];
  let used = 0;
  for (const line of source.split("\n")) {
    if (!line.trim()) continue;
    if (picked.length >= lines + 1 || used >= maxChars) break;
    picked.push(line.length > maxChars ? line.slice(0, maxChars) : line);
    used += line.length;
  }
  return picked.join("\n\n");
}

export interface RichContentPreviewProps {
  source: string | null | undefined;
  /** CSS line clamp (1 = single-line truncate). Default 2. */
  lines?: 1 | 2 | 3 | 4 | 6;
  /** Hard cap on source characters handed to the renderer. Default 400. */
  maxChars?: number;
  className?: string;
}

export function RichContentPreview({
  source,
  lines = 2,
  maxChars = 400,
  className,
}: RichContentPreviewProps) {
  if (!source || !source.trim()) return null;
  // A kind becomes its one-line form BEFORE the line cut (P6): cutting a
  // pretty-printed kind first would leave half an object to the inline level.
  const cut = previewSource(inlineKindText(source), lines, maxChars);
  return (
    <span className={cn("block min-w-0", CLAMP[lines], className)}>
      <RichContent source={cut} level="inline" links="text" isStreaming={false} />
    </span>
  );
}

export default RichContentPreview;
