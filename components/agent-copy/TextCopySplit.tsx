"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CopySplitButton, type SplitCopyFlavor } from "@ai-matrx/rich-content/copy/CopySplitButton";
import { copyRichContent } from "@ai-matrx/rich-content/copy/copy-commands";

export interface TextCopySplitProps {
  /** The markdown to copy (or a function reading it at click time). */
  text: string | (() => string);
  /** What is copied, for the button's name ("Copy message"). */
  label?: string;
  size?: "sm" | "xs";
  className?: string;
  disabled?: boolean;
}

/**
 * The split Copy for hosts whose copy has no Alchemy palette (a person's own chat message, a flashcard side,
 * the phone note dock): one click copies the person's flavor, the chevron offers markdown or plain text.
 * Both end in `copyRichContent` over the same text — the button and its menu cannot disagree.
 * Guard: components/matrx/buttons/__tests__/rich-copy-hosts.census.test.ts.
 */
export function TextCopySplit({ text, label = "Copy", size = "sm", className, disabled }: TextCopySplitProps) {
  const copy = React.useCallback(
    (flavor: SplitCopyFlavor) => copyRichContent(typeof text === "function" ? text() : text, flavor),
    [text],
  );
  return <CopySplitButton copy={copy} label={label} size={size} className={className} disabled={disabled} />;
}

export default TextCopySplit;

/**
 * The chevron half of the split Copy for a host whose main control is already a one-click tile (the phone
 * note dock): it sits on the tile's corner. It IS the shared `CopySplitButton` (`moreOnly`) — same two rows,
 * same "Default" tag, same copy module — never a second build of the menu.
 */
export function TextCopyChevron({ text, label = "Copy", className }: { text: string | (() => string); label?: string; className?: string }) {
  const copy = React.useCallback(
    (flavor: SplitCopyFlavor) => copyRichContent(typeof text === "function" ? text() : text, flavor),
    [text],
  );
  return <CopySplitButton moreOnly copy={copy} label={label} className={cn("absolute right-0 top-0 z-20", className)} />;
}
