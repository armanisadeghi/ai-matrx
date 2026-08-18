"use client";

// CardFaceContent — the ONE way to render a flashcard face's text anywhere
// that is not the full flip card. Per THE CANONICAL COMPONENT LAW this is the
// per-field child of FlashcardItem: same rendering engine
// (ConfigurableMarkdownContent → markdown + KaTeX), compact style presets for
// small slots. A face rendered as raw text ({card.front}) is a defect — a
// calculus student sees literal \frac{dy}{dx} — so every surface that shows a
// face (Write/Test prompts, Match tiles, sidebar rows, CardPeek) renders
// through this component instead.
//
// Variants:
//  - "prompt": the question slot in Write/Test — text-lg, left-aligned.
//  - "inline": list rows / tiles / peeks — inherits the slot's text styling;
//    pass line-clamp-* via className for clamped rows.
//
// The flip card itself (FlashcardItem) keeps its own auto-scaling style built
// from the shared helpers below — one source of face-style truth.

import {
  ConfigurableMarkdownContent,
  type MarkdownStyleConfig,
} from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import { cn } from "@/lib/utils";

export type CardFaceVariant = "prompt" | "inline";

/** Auto-scaling face text size for the flip card (moved from FlashcardItem). */
export function getFaceTextSizeClass(
  text: string,
  isMultiLine: boolean = false,
): string {
  const length = text.length;

  if (isMultiLine) {
    // multiline back: list items, numbered steps, etc.
    if (length < 120) return "text-xl";
    if (length < 200) return "text-lg";
    if (length < 320) return "text-base";
    if (length < 500) return "text-sm";
    return "text-xs";
  }

  // single-line front or back
  if (length < 20) return "text-3xl md:text-4xl";
  if (length < 40) return "text-2xl md:text-3xl";
  if (length < 80) return "text-xl md:text-2xl";
  if (length < 140) return "text-lg md:text-xl";
  if (length < 220) return "text-base md:text-lg";
  if (length < 320) return "text-sm md:text-base";
  return "text-xs md:text-sm";
}

/**
 * The flip-card face style (moved from FlashcardItem so there is one source
 * of face-style truth). Preserves the card's visual identity while adding
 * LaTeX/RTL/markdown rendering.
 */
export function makeCardFaceStyle(
  textSizeClass: string,
  centered: boolean,
): MarkdownStyleConfig {
  return {
    typography: {
      fontSizeLtr: textSizeClass,
      fontSizeRtl: textSizeClass,
      leading: centered ? "leading-relaxed" : "leading-snug",
      tracking: "tracking-normal",
    },
    colors: {
      // Keep theme-aware text — foreground for body, blue for accents
      headingColor: "text-blue-600 dark:text-blue-400",
      emColorLight: "text-blue-600",
      emColorDark: "dark:text-blue-400",
      codeBgLight: "bg-blue-100",
      codeTextLight: "text-blue-800",
      codeBgDark: "dark:bg-blue-900/30",
      codeTextDark: "dark:text-blue-300",
      blockquoteBgLight: "bg-blue-50",
      blockquoteBgDark: "dark:bg-blue-950/20",
      blockquoteBorderLight: "border-blue-200",
      blockquoteBorderDark: "dark:border-blue-700",
      blockquoteTextLight: "text-gray-700",
      blockquoteTextDark: "dark:text-gray-300",
      hrBorderLight: "border-gray-300",
      hrBorderDark: "dark:border-gray-600",
      checkboxBorderLight: "border-blue-400",
      checkboxCheckedBgLight: "bg-blue-600",
      editButtonColor: "text-transparent",
      editButtonHoverColor: "hover:text-transparent",
    },
    spacing: {
      wrapperMy: "my-0",
      paragraphMb: "mb-1",
      listMb: "mb-1",
      listPl: "pl-6",
      listItemMb: "mb-0.5",
      blockquotePl: "pl-3",
      blockquotePr: "pr-3",
      blockquotePy: "py-2",
      preMy: "my-1",
      imgMy: "my-2",
      hrMy: "my-1",
      mathParagraphMb: "mb-2",
      blankLineHeight: "h-[0.4em]",
    },
    headings: {
      h1: "text-xl font-bold mb-1",
      h2: "text-lg font-semibold mb-1",
      h3: "text-base font-semibold mb-0.5",
      h4: "text-sm font-semibold mb-0.5",
    },
    wrapperClassName: cn(
      "font-medium text-gray-800 dark:text-gray-200 w-full",
      centered ? "text-center" : "text-left",
      textSizeClass,
    ),
  };
}

/** Compact neutral style shared by the small-slot variants. */
function makeSlotStyle(
  variant: CardFaceVariant,
  className?: string,
): MarkdownStyleConfig {
  const isPrompt = variant === "prompt";
  return {
    typography: {
      fontSizeLtr: isPrompt ? "text-lg" : "",
      fontSizeRtl: isPrompt ? "text-lg" : "",
      leading: "leading-snug",
      tracking: "tracking-normal",
    },
    colors: {
      headingColor: "text-foreground",
      emColorLight: "text-foreground",
      emColorDark: "dark:text-foreground",
      editButtonColor: "text-transparent",
      editButtonHoverColor: "hover:text-transparent",
    },
    spacing: {
      wrapperMy: "my-0",
      paragraphMb: isPrompt ? "mb-1" : "mb-0",
      listMb: isPrompt ? "mb-1" : "mb-0",
      listPl: "pl-5",
      listItemMb: "mb-0",
      preMy: "my-1",
      imgMy: isPrompt ? "my-2" : "my-0.5",
      hrMy: "my-1",
      mathParagraphMb: isPrompt ? "mb-1" : "mb-0",
      blankLineHeight: "h-[0.3em]",
    },
    headings: {
      // A face that happens to contain heading markup must not explode a
      // small slot — headings render as emphasized body text.
      h1: isPrompt ? "text-lg font-semibold mb-1" : "font-semibold mb-0",
      h2: isPrompt ? "text-lg font-semibold mb-1" : "font-semibold mb-0",
      h3: isPrompt ? "text-base font-semibold mb-0.5" : "font-semibold mb-0",
      h4: isPrompt ? "text-base font-semibold mb-0.5" : "font-semibold mb-0",
    },
    wrapperClassName: cn(
      isPrompt
        ? "text-lg font-medium leading-snug text-foreground text-left w-full"
        : "min-w-0 leading-snug",
      className,
    ),
  };
}

export function CardFaceContent({
  content,
  variant = "prompt",
  className,
}: {
  /** The face text — markdown + LaTeX ($…$ / $$…$$) supported. */
  content: string;
  variant?: CardFaceVariant;
  /** Extra wrapper classes — e.g. "line-clamp-2" for clamped rows. */
  className?: string;
}) {
  return (
    <ConfigurableMarkdownContent
      content={content}
      isStreamActive={false}
      showCopyButton={false}
      styleConfig={makeSlotStyle(variant, className)}
    />
  );
}

export default CardFaceContent;
