"use client";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/styles/themes/utils";
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import type { MarkdownStyleConfig } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";
import type { ReviewResult } from "@/features/flashcards/types";

const centeredParagraph = ({ node, children, ...props }: any) => (
  <p className="text-center" {...props}>{children}</p>
);

interface FlashcardItemProps {
  front: string;
  back: string | null;
  index: number;
  layoutMode?: "grid" | "list";
  /** When provided, shows review buttons on the back of the card (study mode). */
  onReview?: (cardIndex: number, result: ReviewResult) => void;
  /** Last review result — shows a small indicator on the front corner. */
  lastResult?: ReviewResult | null;
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({
  front,
  back,
  index,
  layoutMode = "grid",
  onReview,
  lastResult,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isMultiLineBack = back != null && back.includes("\n");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const checkOverflow = () => {
      setHasOverflow(el.scrollHeight > el.clientHeight + 2);
      setIsScrolledToBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
    };
    checkOverflow();
    el.addEventListener("scroll", checkOverflow);
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkOverflow); ro.disconnect(); };
  }, [back, isFlipped]);

  const handleClick = () => {
    setIsFlipped(!isFlipped);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsFlipped(!isFlipped);
    }
  };

  const handleReview = (result: ReviewResult, e: React.MouseEvent) => {
    e.stopPropagation();
    onReview?.(index, result);
    // Flip back to front after reviewing
    setTimeout(() => setIsFlipped(false), 300);
  };

  const resultIndicator: Record<ReviewResult, { color: string; label: string }> = {
    correct: { color: "bg-green-500", label: "Correct" },
    partial: { color: "bg-amber-500", label: "Partial" },
    incorrect: { color: "bg-red-500", label: "Incorrect" },
  };

  const getTextSizeClass = (text: string, isMultiLine: boolean = false) => {
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
    if (length < 20)  return "text-3xl md:text-4xl";
    if (length < 40)  return "text-2xl md:text-3xl";
    if (length < 80)  return "text-xl md:text-2xl";
    if (length < 140) return "text-lg md:text-xl";
    if (length < 220) return "text-base md:text-lg";
    if (length < 320) return "text-sm md:text-base";
    return "text-xs md:text-sm";
  };

  // Build a style config that preserves all existing visual properties
  // but adds LaTeX/RTL/markdown rendering capabilities.
  const makeCardStyle = (textSizeClass: string, centered: boolean): MarkdownStyleConfig => ({
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
  });

  const frontStyleConfig = useMemo(
    () => makeCardStyle(getTextSizeClass(front), true),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [front],
  );

  const backStyleConfig = useMemo(
    () => makeCardStyle(getTextSizeClass(back ?? "", isMultiLineBack), !isMultiLineBack),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [back, isMultiLineBack],
  );

  const backContent = back === null ? "_Loading…_" : back;

  return (
    <div
      className={cn(
        "relative w-full cursor-pointer group h-56",
        "animate-in fade-in duration-300",
      )}
      style={{ perspective: "1000px" }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={`Flashcard ${index + 1}. Click to flip. ${isFlipped ? "Showing back" : "Showing front"}`}
    >
      <div
        className="relative w-full h-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front of card */}
        <Card
          className={cn(
            "absolute w-full h-full overflow-hidden",
            "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950",
            "border-2 border-blue-200 dark:border-blue-800",
            "shadow-lg hover:shadow-xl transition-shadow",
          )}
          style={{ backfaceVisibility: "hidden" }}
        >
          <CardContent className="flex flex-col items-center justify-center h-full !p-2 relative">
            <div className="w-full h-full flex items-center justify-center px-2 overflow-y-auto scrollbar-none">
              <ConfigurableMarkdownContent
                content={front}
                isStreamActive={false}
                showCopyButton={false}
                styleConfig={frontStyleConfig}
                componentOverrides={{ p: centeredParagraph }}
              />
            </div>
            {lastResult && (
              <div
                className={cn(
                  "absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full",
                  resultIndicator[lastResult].color,
                )}
                title={resultIndicator[lastResult].label}
              />
            )}
            {isHovered && (
              <div className="absolute bottom-1 right-2 text-[9px] text-blue-600/60 dark:text-blue-400/60 animate-in fade-in duration-200 whitespace-nowrap">
                click to flip
              </div>
            )}
          </CardContent>
        </Card>

        {/* Back of card */}
        <Card
          className={cn(
            "absolute w-full h-full overflow-hidden",
            "bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950",
            "border-2 border-green-200 dark:border-green-800",
            "shadow-lg hover:shadow-xl transition-shadow",
          )}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        >
          <CardContent
            className={cn(
              "flex flex-col h-full !p-2 relative",
              onReview ? "!pb-0" : "!pb-0",
              isMultiLineBack ? "items-start justify-start" : "items-center justify-center",
            )}
          >
            <div className={cn("relative w-full", isMultiLineBack ? "h-full" : "")}>
              <div
                ref={scrollRef}
                className={cn(
                  "overflow-y-auto scrollbar-none px-1 w-full",
                  isMultiLineBack ? "h-full pt-3 pb-2" : "",
                )}
              >
                <ConfigurableMarkdownContent
                  content={backContent}
                  isStreamActive={back === null}
                  showCopyButton={false}
                  styleConfig={backStyleConfig}
                  componentOverrides={isMultiLineBack ? undefined : { p: centeredParagraph }}
                />
              </div>
              {hasOverflow && !isScrolledToBottom && (
                <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-emerald-50 dark:from-emerald-950 to-transparent" />
              )}
            </div>
            {onReview ? (
              <div className="flex items-center justify-center gap-1.5 py-1.5 border-t border-green-200 dark:border-green-800 mt-auto shrink-0">
                <button
                  onClick={(e) => handleReview('incorrect', e)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors"
                  title="I got this wrong"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Missed
                </button>
                <button
                  onClick={(e) => handleReview('partial', e)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors"
                  title="I partially knew this"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Partial
                </button>
                <button
                  onClick={(e) => handleReview('correct', e)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                  title="I got this right"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Got it
                </button>
              </div>
            ) : isHovered ? (
              <div className="absolute bottom-1 right-2 text-[9px] text-green-600/60 dark:text-green-400/60 animate-in fade-in duration-200 whitespace-nowrap">
                click to flip
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FlashcardItem;
