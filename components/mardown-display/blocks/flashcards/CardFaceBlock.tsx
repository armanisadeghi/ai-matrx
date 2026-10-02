"use client";

// CardFaceBlock — a flashcard face rendered exactly the way the flip card
// (FlashcardItem) renders it: ConfigurableMarkdownContent + makeCardFaceStyle,
// a single-line face centered, a multi-line face (bullets, steps) left-aligned,
// KaTeX math through the same markdown core. For small fixed slots that need
// the real card look — the Match tiles — where CardFaceContent's phrasing-only
// "inline" level would collapse a bulleted back onto one line.
//
// Lives beside CardFaceContent rather than inside it so CardFaceContent's
// import graph (it is reachable from the chat engine) never gains the block
// markdown renderer. Style truth stays in CardFaceContent's shared helpers.

import type React from "react";
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import { makeCardFaceStyle } from "./CardFaceContent";

const centeredParagraph = ({
  node: _node,
  children,
  ...props
}: React.ComponentProps<"p"> & { node?: unknown }) => (
  <p className="text-center" {...props}>
    {children}
  </p>
);

/** Compact face size for a small tile — the flip card's scale steps down. */
export function getTileFaceTextSizeClass(
  text: string,
  isMultiLine: boolean,
): string {
  const length = text.length;
  if (isMultiLine) return length < 160 ? "text-xs sm:text-sm" : "text-xs";
  if (length < 40) return "text-sm sm:text-base";
  if (length < 120) return "text-xs sm:text-sm";
  return "text-xs";
}

export function CardFaceBlock({ content }: { content: string }) {
  const isMultiLine = content.includes("\n");
  return (
    <ConfigurableMarkdownContent
      imagePolicy="inherit"
      content={content}
      isStreamActive={false}
      showCopyButton={false}
      styleConfig={makeCardFaceStyle(
        getTileFaceTextSizeClass(content, isMultiLine),
        !isMultiLine,
      )}
      componentOverrides={isMultiLine ? undefined : { p: centeredParagraph }}
    />
  );
}

export default CardFaceBlock;
