"use client";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/styles/themes/utils";
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import type { MarkdownStyleConfig } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import { FlashcardGradeButtonRow } from "@/features/flashcards/components/study/FlashcardGradeButton";
import { VoiceTestButton } from "@/features/flashcards/fast-fire/voice-test/VoiceTestButton";
import { FlashcardGoDeeperTrigger } from "./FlashcardGoDeeperTrigger";
import { WrenchTapButton } from "@/components/icons/tap-buttons";
import {
  parseSubcardsFromDetails,
  resolveFlashcardSubcards,
  type FlashcardSubcard,
} from "./flashcard-subcards";
import type { ReviewResult } from "@/features/flashcards/types";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/slices/userSlice";
import { useOpenFlashcardItemWindow } from "@/features/overlays/openers/flashcardItemWindow";

const centeredParagraph = ({
  node,
  children,
  ...props
}: React.ComponentProps<"p"> & { node?: unknown }) => (
  <p className="text-center" {...props}>
    {children}
  </p>
);

interface FlashcardItemProps {
  front: string;
  back: string | null;
  index: number;
  layoutMode?: "grid" | "list";
  /** Optional extra JSON from pre-parsed card payloads (topic, subcards, …). */
  additionalDetails?: Record<string, unknown>;
  /** Nested cards when already extracted upstream (wins over additionalDetails). */
  subcards?: FlashcardSubcard[];
  /** When provided, shows review buttons on the back of the card (study mode). */
  onReview?: (cardIndex: number, result: ReviewResult) => void;
  /** Last review result — shows a small indicator on the front corner. */
  lastResult?: ReviewResult | null;
  /** Inline block card vs edge-to-edge window panel body. */
  presentation?: "inline" | "panel";
  /** Admin dev trigger to open as window — off when already in a window. */
  showDevWindowTrigger?: boolean;
  /** Parent-controlled flip (study surfaces). */
  flipped?: boolean;
  onFlipToggle?: () => void;
  /** When set, shows a compact voice-quiz mic icon in the top-right corner. */
  voiceTest?: {
    cardId: string;
    spokenFrontFileId?: string | null;
  };
}

const FlashcardItem: React.FC<FlashcardItemProps> = ({
  front,
  back,
  index,
  layoutMode = "grid",
  additionalDetails,
  subcards: subcardsProp,
  onReview,
  lastResult,
  presentation = "inline",
  showDevWindowTrigger = true,
  flipped,
  onFlipToggle,
  voiceTest,
}) => {
  const isPanel = presentation === "panel";
  const isControlledFlip = flipped !== undefined;
  const [internalFlipped, setInternalFlipped] = useState(false);
  const isFlipped = isControlledFlip ? flipped : internalFlipped;
  const [isHovered, setIsHovered] = useState(false);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAdmin = useAppSelector(selectIsAdmin);
  const openFlashcardItemWindow = useOpenFlashcardItemWindow();

  const isMultiLineBack = back != null && back.includes("\n");
  const subcards = useMemo(
    () => resolveFlashcardSubcards(additionalDetails, subcardsProp),
    [additionalDetails, subcardsProp],
  );

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" &&
      additionalDetails &&
      Object.keys(additionalDetails).length > 0
    ) {
      console.log(
        `[FlashcardItem ${index + 1}] additionalDetails:`,
        additionalDetails,
        `resolved subcards: ${subcards.length}`,
      );
    }
  }, [additionalDetails, index, subcards.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return undefined;
    const checkOverflow = () => {
      setHasOverflow(el.scrollHeight > el.clientHeight + 2);
      setIsScrolledToBottom(
        el.scrollTop + el.clientHeight >= el.scrollHeight - 4,
      );
    };
    checkOverflow();
    el.addEventListener("scroll", checkOverflow);
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkOverflow);
      ro.disconnect();
    };
  }, [back, isFlipped]);

  const toggleFlip = () => {
    if (isControlledFlip) {
      onFlipToggle?.();
    } else {
      setInternalFlipped((f) => !f);
    }
  };

  const handleClick = () => {
    toggleFlip();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleFlip();
    }
  };

  const resetFlip = () => {
    if (isControlledFlip) {
      if (isFlipped) onFlipToggle?.();
    } else {
      setInternalFlipped(false);
    }
  };

  const handleReview = (result: ReviewResult) => {
    onReview?.(index, result);
    // Flip back to front after reviewing
    setTimeout(() => resetFlip(), 300);
  };

  const resultIndicator: Record<
    ReviewResult,
    { color: string; label: string }
  > = {
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
    if (length < 20) return "text-3xl md:text-4xl";
    if (length < 40) return "text-2xl md:text-3xl";
    if (length < 80) return "text-xl md:text-2xl";
    if (length < 140) return "text-lg md:text-xl";
    if (length < 220) return "text-base md:text-lg";
    if (length < 320) return "text-sm md:text-base";
    return "text-xs md:text-sm";
  };

  // Build a style config that preserves all existing visual properties
  // but adds LaTeX/RTL/markdown rendering capabilities.
  const makeCardStyle = (
    textSizeClass: string,
    centered: boolean,
  ): MarkdownStyleConfig => ({
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
    () =>
      makeCardStyle(
        getTextSizeClass(back ?? "", isMultiLineBack),
        !isMultiLineBack,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [back, isMultiLineBack],
  );

  const backContent = back === null ? "_Loading…_" : back;

  const handleOpenInWindow = () => {
    openFlashcardItemWindow({
      front,
      back,
      index,
      layoutMode,
      additionalDetails: additionalDetails ?? null,
      lastResult: lastResult ?? null,
      title: `Flashcard ${index + 1}`,
    });
  };

  return (
    <div
      className={cn(
        "relative w-full cursor-pointer group",
        isPanel ? "h-full min-h-0 flex-1" : "h-56",
        !isPanel && "animate-in fade-in duration-300",
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
      {showDevWindowTrigger && isAdmin && (
        <div
          className="absolute top-0 left-0 z-20"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <WrenchTapButton
            variant="solid"
            bgColor="bg-emerald-600"
            iconColor="text-white"
            hoverBgColor="hover:bg-emerald-500"
            activeBgColor="active:bg-emerald-700"
            ariaLabel="[DEV] Open flashcard in window panel"
            tooltip="[DEV] Open flashcard in window panel"
            onClick={handleOpenInWindow}
          />
        </div>
      )}
      {voiceTest && back !== null && (
        <div
          className="absolute top-0 right-0 z-20"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <VoiceTestButton
            card={{ id: voiceTest.cardId, front, back }}
            spokenFrontFileId={voiceTest.spokenFrontFileId}
            iconOnly
          />
        </div>
      )}
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
            isPanel
              ? "rounded-none border-0 shadow-none"
              : "border-2 border-blue-200 dark:border-blue-800 shadow-lg hover:shadow-xl transition-shadow",
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
                  "absolute w-2.5 h-2.5 rounded-full",
                  voiceTest ? "bottom-1.5 left-1.5" : "top-1.5 right-1.5",
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
            isPanel
              ? "rounded-none border-0 shadow-none"
              : "border-2 border-green-200 dark:border-green-800 shadow-lg hover:shadow-xl transition-shadow",
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
              isMultiLineBack
                ? "items-start justify-start"
                : "items-center justify-center",
            )}
          >
            {subcards.length > 0 && (
              <div
                className={cn(
                  "absolute left-1.5 z-10",
                  onReview ? "bottom-[3.25rem]" : "bottom-1.5",
                )}
                onClick={(e) => e.stopPropagation()}
              >
                <FlashcardGoDeeperTrigger
                  subcards={subcards}
                  parentFront={front}
                />
              </div>
            )}
            <div
              className={cn("relative w-full", isMultiLineBack ? "h-full" : "")}
            >
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
                  componentOverrides={
                    isMultiLineBack ? undefined : { p: centeredParagraph }
                  }
                />
              </div>
              {hasOverflow && !isScrolledToBottom && (
                <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-emerald-50 dark:from-emerald-950 to-transparent" />
              )}
            </div>
            {onReview ? (
              <div
                className="mt-auto shrink-0 border-t border-green-200 px-1 py-1.5 dark:border-green-800"
                onClick={(e) => e.stopPropagation()}
              >
                <FlashcardGradeButtonRow
                  onGrade={handleReview}
                  size="embedded"
                  className="w-full"
                />
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
