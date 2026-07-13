"use client";
import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  useLayoutEffect,
} from "react";
import { useSwipeable } from "react-swipeable";
import {
  X,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  RotateCcw,
  Shuffle,
  LogOut,
  GripHorizontal,
  Layers,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { ConfigurableMarkdownContent } from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import type {
  MarkdownComponentOverrides,
  MarkdownStyleConfig,
} from "@/components/mardown-display/chat-markdown/ConfigurableMarkdownContent";
import { FlashcardGradeButtonRow } from "@/features/flashcards/components/study/FlashcardGradeButton";
import { MatchingCardPlayer } from "@/features/flashcards/components/study/MatchingCardPlayer";
import { CARD_KIND } from "@/features/flashcards/utils/cardVariants";
import type { ReviewResult } from "@/features/flashcards/types";
import type { FlashcardMobileCard } from "./flashcard-mobile-bridge";

const ANIM_MS = 320;
const TEXT_FADE_OUT_MS = 120;
// Filmstrip thumbnail dimensions
const THUMB_W = 88;
const THUMB_H = 118;
const THUMB_GAP = 10;
const THUMB_STEP = THUMB_W + THUMB_GAP;

interface FlashcardMobileViewProps {
  cards: FlashcardMobileCard[];
  initialIndex?: number;
  onClose: () => void;
  /** browse = shuffle + browse drawer; study = grading + no shuffle */
  mode?: "browse" | "study";
  /** External index control (study surfaces) */
  controlledIndex?: number;
  onIndexChange?: (index: number) => void;
  controlledFlipped?: boolean;
  onFlipToggle?: () => void;
  onGrade?: (result: ReviewResult) => void;
  resultsByIndex?: Record<number, ReviewResult | undefined>;
  grading?: boolean;
}

// ─────────────────────────────────────────────
// TapZoneHints
// ─────────────────────────────────────────────
const TapZoneHints: React.FC<{
  canGoPrev: boolean;
  canGoNext: boolean;
  menuOpen: boolean;
  flipColor: string;
}> = ({ canGoPrev, canGoNext, menuOpen, flipColor }) => (
  <div className="absolute inset-0 flex items-end pointer-events-none select-none">
    <div
      className={cn(
        "w-[20%] flex items-center justify-start pl-2 pb-3",
        canGoPrev ? "text-white/40" : "text-white/15",
      )}
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="text-[9px] leading-none">tap</span>
    </div>
    <div className="flex-1 flex flex-col items-center justify-end pb-2 gap-0.5">
      <div className={cn("text-[10px]", flipColor)}>tap to flip</div>
      {!menuOpen && (
        <div className="text-white/20 text-[9px]">
          ↑ up for more · ↓ jump to card
        </div>
      )}
    </div>
    <div
      className={cn(
        "w-[20%] flex items-center justify-end pr-2 pb-3",
        canGoNext ? "text-white/40" : "text-white/15",
      )}
    >
      <span className="text-[9px] leading-none">tap</span>
      <ChevronRight className="h-4 w-4" />
    </div>
  </div>
);

// ─────────────────────────────────────────────
// CardSlide
// ─────────────────────────────────────────────
interface CardSlideProps {
  card: FlashcardMobileCard;
  isFlipped: boolean;
  style?: React.CSSProperties;
  showHints?: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  textVisible?: boolean;
  menuOpen?: boolean;
}

// p override that forces text-center — used for front & single-line back faces.
const centeredParagraph = ({
  node,
  children,
  ...props
}: React.ComponentProps<"p"> & { node?: unknown }) => (
  <p className="text-center" {...props}>
    {children}
  </p>
);

// Shared style config factory for mobile flashcard faces.
// Font size is applied via inline style (not Tailwind class) so dynamic sizing works.
const makeMobileCardStyle = (centered: boolean): MarkdownStyleConfig => ({
  typography: {
    fontSizeLtr: "",
    fontSizeRtl: "",
    leading: centered ? "leading-normal" : "leading-snug",
    tracking: "tracking-normal",
  },
  colors: {
    headingColor: "text-white",
    emColorLight: "text-white/80",
    emColorDark: "text-white/80",
    codeBgLight: "bg-white/10",
    codeTextLight: "text-white",
    codeBgDark: "bg-white/10",
    codeTextDark: "text-white",
    blockquoteBgLight: "bg-white/5",
    blockquoteBgDark: "bg-white/5",
    blockquoteBorderLight: "border-white/30",
    blockquoteBorderDark: "border-white/30",
    blockquoteTextLight: "text-white/80",
    blockquoteTextDark: "text-white/80",
    hrBorderLight: "border-white/20",
    hrBorderDark: "border-white/20",
    checkboxBorderLight: "border-white/50",
    checkboxCheckedBgLight: "bg-white/80",
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
    preMy: "my-2",
    imgMy: "my-2",
    hrMy: "my-2",
    mathParagraphMb: "mb-2",
    blankLineHeight: "h-[0.5em]",
  },
  headings: {
    h1: "text-xl font-bold mb-1 text-white",
    h2: "text-lg font-semibold mb-1 text-white",
    h3: "text-base font-semibold mb-1 text-white",
    h4: "text-sm font-semibold mb-0.5 text-white",
  },
  wrapperClassName: cn(
    "text-white font-medium w-full",
    centered ? "text-center" : "text-left",
  ),
});

// Count meaningful lines (non-empty after trimming) in a back-card string.
const countLines = (text: string): number =>
  text.split("\n").filter((l) => l.trim().length > 0).length;

// ─────────────────────────────────────────────
// FitTextFace — renders markdown content and auto-sizes font to fill container
// ─────────────────────────────────────────────
const MAX_FONT_PX = 64;
const MIN_FONT_PX = 14;

interface FitTextFaceProps {
  content: string;
  centered: boolean;
  isStreamActive?: boolean;
  componentOverrides?: MarkdownComponentOverrides;
}

const FitTextFace: React.FC<FitTextFaceProps> = ({
  content,
  centered,
  isStreamActive = false,
  componentOverrides,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  // Start at the MIN size: if the container isn't laid out yet on first paint
  // (0-height during the fullscreen transition / flex settle), the fallback is
  // small readable text — never giant text overflowing the screen.
  const [fontSize, setFontSize] = useState(MIN_FONT_PX);

  const styleConfig = useMemo(() => makeMobileCardStyle(centered), [centered]);

  const lastBestRef = useRef(0);

  // Measure whether the text overflows and binary-search from MAX down to MIN
  // for the largest size that fits.
  //
  // ReactMarkdown is a `dynamic(ssr:false)` import, so on first mount the text
  // node is EMPTY until its JS chunk loads a beat later — measuring then yields
  // a false "everything fits" and locks in the MAX (72px) giant text. The fix:
  // observe the TEXT element (not just the container) so we re-fit the instant
  // the async markdown content actually paints. Container is observed too, for
  // viewport/rotation changes.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;

    if (!container || !text) return undefined;

    const fit = () => {
      const containerH = container.clientHeight;
      const containerW = container.clientWidth;

      // Not laid out yet — wait for the ResizeObserver to fire with real dims.
      if (containerH === 0 || containerW === 0) return;

      // If the async markdown chunk hasn't painted yet the node is empty:
      // measuring now falsely reports "fits" and locks in the MAX size. Detect
      // it (near-zero natural height at the min probe size) and defer — the
      // text ResizeObserver re-fires the moment the content actually paints.
      text.style.fontSize = `${MIN_FONT_PX}px`;
      if (text.scrollHeight < MIN_FONT_PX) return;

      // The markdown wrapper uses `overflow-wrap: break-word`, which snaps a
      // too-wide single word (e.g. "Ribosome") mid-word onto a new line instead
      // of overflowing — hiding it from a height-only measurement. Temporarily
      // disable word-breaking + reveal horizontal overflow so an over-wide word
      // reports via scrollWidth, then require BOTH axes to fit. Restored after.
      const descendants = text.querySelectorAll<HTMLElement>("*");
      const prev = new Map<
        HTMLElement,
        { ow: string; wb: string; ox: string }
      >();
      descendants.forEach((el) => {
        prev.set(el, {
          ow: el.style.overflowWrap,
          wb: el.style.wordBreak,
          ox: el.style.overflowX,
        });
        el.style.overflowWrap = "normal";
        el.style.wordBreak = "normal";
        el.style.overflowX = "visible";
      });

      let lo = MIN_FONT_PX;
      let hi = MAX_FONT_PX;
      let best = MIN_FONT_PX;

      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        text.style.fontSize = `${mid}px`;
        // Force layout recalc
        const textH = text.scrollHeight;
        const textW = text.scrollWidth;

        // Fits only if it clears BOTH axes (+1px tolerance on width for
        // sub-pixel rounding of the widest word).
        if (textH <= containerH && textW <= containerW + 1) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      // Restore the original break behavior so genuinely-too-long content still
      // degrades gracefully (wraps) at the final size instead of overflowing.
      descendants.forEach((el) => {
        const p = prev.get(el);
        if (!p) return;
        el.style.overflowWrap = p.ow;
        el.style.wordBreak = p.wb;
        el.style.overflowX = p.ox;
      });

      text.style.fontSize = `${best}px`;
      if (best !== lastBestRef.current) {
        lastBestRef.current = best;
        setFontSize(best);
      }
    };

    fit();

    // Observe BOTH: `text` catches the async markdown paint (the real bug),
    // `container` catches viewport/rotation changes.
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    ro.observe(text);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center"
    >
      <div
        ref={textRef}
        className="w-full"
        style={{ fontSize: `${fontSize}px` }}
      >
        <ConfigurableMarkdownContent
          content={content}
          isStreamActive={isStreamActive}
          showCopyButton={false}
          styleConfig={styleConfig}
          componentOverrides={componentOverrides}
        />
      </div>
    </div>
  );
};

const CardSlide: React.FC<CardSlideProps> = ({
  card,
  isFlipped,
  style,
  showHints,
  canGoPrev,
  canGoNext,
  textVisible = true,
  menuOpen = false,
}) => {
  const isMultiLine =
    card.back != null && (card.back.includes("\n") || card.back.length > 120);

  const backContent = card.back === null ? "_Loading…_" : card.back;

  // Short lists (≤4 lines) should be vertically centered, not top-aligned.
  const backLineCount = card.back ? countLines(card.back) : 0;
  const isShortList = isMultiLine && backLineCount <= 4;
  const backCentered = !isMultiLine || isShortList;

  return (
    <div
      className="absolute inset-0"
      style={{ perspective: "1200px", ...style }}
    >
      <div
        className="absolute inset-0 transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-blue-900 to-indigo-950"
          style={{ backfaceVisibility: "hidden" }}
        >
          <div
            className="w-full h-full px-6 py-10"
            style={{
              opacity: textVisible ? 1 : 0,
              transition: `opacity ${TEXT_FADE_OUT_MS}ms ease`,
            }}
          >
            <FitTextFace
              content={card.front ?? ""}
              centered={true}
              componentOverrides={{ p: centeredParagraph }}
            />
          </div>
          {showHints && (
            <TapZoneHints
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              menuOpen={menuOpen}
              flipColor="text-blue-300/40"
            />
          )}
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 bg-gradient-to-br from-green-900 to-emerald-950"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          <div
            className="w-full h-full px-6 py-10"
            style={{
              opacity: textVisible ? 1 : 0,
              transition: `opacity ${TEXT_FADE_OUT_MS}ms ease`,
            }}
          >
            <FitTextFace
              content={backContent}
              centered={backCentered}
              isStreamActive={card.back === null}
              componentOverrides={
                backCentered ? { p: centeredParagraph } : undefined
              }
            />
          </div>
          {showHints && (
            <TapZoneHints
              canGoPrev={canGoPrev}
              canGoNext={canGoNext}
              menuOpen={menuOpen}
              flipColor="text-green-300/40"
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// FilmstripScrubber
// ─────────────────────────────────────────────
const FilmstripScrubber: React.FC<{
  cards: FlashcardMobileCard[];
  activeIndex: number;
  isOpen: boolean;
  onSelect: (i: number) => void;
  onClose: () => void;
  resultsByIndex?: Record<number, ReviewResult | undefined>;
}> = ({ cards, activeIndex, isOpen, onSelect, onClose, resultsByIndex }) => {
  const total = cards.length;
  const viewportRef = useRef<HTMLDivElement>(null);
  // offsetX = how many px the strip has scrolled (card 0 is at center when offsetX=0)
  const [offsetX, setOffsetX] = useState(() => activeIndex * THUMB_STEP);
  const [snapping, setSnapping] = useState(false);

  // Sync to current card whenever the scrubber opens
  useEffect(() => {
    if (isOpen) {
      setSnapping(true);
      setOffsetX(activeIndex * THUMB_STEP);
      setTimeout(() => setSnapping(false), 250);
    }
  }, [isOpen, activeIndex]);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);
  const velocityRef = useRef(0);
  const lastX = useRef(0);
  const lastTime = useRef(0);

  const clamp = useCallback(
    (v: number) => Math.max(0, Math.min((total - 1) * THUMB_STEP, v)),
    [total],
  );

  // centeredIndex = whichever card slot is closest to center right now
  const centeredIndex = Math.round(clamp(offsetX) / THUMB_STEP);

  const snapTo = useCallback((targetIndex: number) => {
    setSnapping(true);
    setOffsetX(targetIndex * THUMB_STEP);
    setTimeout(() => setSnapping(false), 250);
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    setSnapping(false);
    const x = e.touches[0].clientX;
    dragStartX.current = x;
    dragStartOffset.current = offsetX;
    lastX.current = x;
    lastTime.current = Date.now();
    velocityRef.current = 0;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const x = e.touches[0].clientX;
    const now = Date.now();
    const dt = Math.max(now - lastTime.current, 1);
    velocityRef.current = (lastX.current - x) / dt; // px/ms, positive = dragging left
    lastX.current = x;
    lastTime.current = now;
    setOffsetX(clamp(dragStartOffset.current + (dragStartX.current - x)));
  };

  const onTouchEnd = () => {
    // project with momentum then snap
    const projected = clamp(offsetX + velocityRef.current * 120);
    snapTo(Math.round(projected / THUMB_STEP));
  };

  return (
    <div className="flex flex-col items-center pt-safe pt-2 pb-3 bg-zinc-950 border-b border-white/10 select-none">
      <div className="text-white/60 text-[11px] mb-2 tracking-wide uppercase font-medium">
        Card {centeredIndex + 1} of {total}
      </div>

      {/* Filmstrip viewport — overflow hidden, full width */}
      <div
        ref={viewportRef}
        className="relative overflow-hidden w-full"
        style={{ height: THUMB_H + 16 }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Highlight ring — always dead center */}
        <div
          className="absolute z-10 pointer-events-none rounded-xl border-2 border-blue-400"
          style={{
            top: "50%",
            left: "50%",
            width: THUMB_W + 6,
            height: THUMB_H + 6,
            transform: "translate(-50%, -50%)",
          }}
        />

        <div
          className="absolute flex items-center touch-none"
          style={{
            top: "50%",
            // Card 0 center at viewport center: left = 50% - THUMB_W/2
            left: `calc(50% - ${THUMB_W / 2}px)`,
            transform: `translateX(-${offsetX}px) translateY(-50%)`,
            gap: THUMB_GAP,
            transition: snapping
              ? "transform 0.25s cubic-bezier(0.25,0.46,0.45,0.94)"
              : "none",
            willChange: "transform",
          }}
        >
          {cards.map((c, i) => {
            const dist = Math.abs(i - centeredIndex);
            const scale = dist === 0 ? 1 : dist === 1 ? 0.82 : 0.66;
            const opacity = dist === 0 ? 1 : dist === 1 ? 0.7 : 0.4;
            const result = resultsByIndex?.[i];
            const isCentered = i === centeredIndex;
            const resultRing =
              result === "correct"
                ? "border-green-500"
                : result === "partial"
                  ? "border-amber-500"
                  : result === "incorrect"
                    ? "border-red-500"
                    : isCentered
                      ? "border-blue-500"
                      : "border-zinc-500";
            return (
              <div
                key={i}
                style={{
                  width: THUMB_W,
                  height: THUMB_H,
                  flexShrink: 0,
                  transform: `scale(${scale})`,
                  opacity,
                  transition: "transform 0.12s ease, opacity 0.12s ease",
                  transformOrigin: "center center",
                }}
                className={cn(
                  "rounded-xl overflow-hidden flex flex-col items-center justify-center cursor-pointer border",
                  isCentered ? "bg-blue-700" : "bg-zinc-700",
                  resultRing,
                )}
                onClick={() => {
                  if (isCentered) onSelect(i);
                  else snapTo(i);
                }}
              >
                <span className="text-white text-[9px] font-medium text-center px-1.5 leading-tight line-clamp-5">
                  {c.front.length > 60 ? c.front.slice(0, 58) + "…" : c.front}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compact action row — keeps total scrubber height tight */}
      <div className="flex items-center justify-center gap-3 mt-2.5">
        <button
          onClick={() => onSelect(centeredIndex)}
          className="px-5 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
        >
          Go to #{centeredIndex + 1}
        </button>
        <button
          onClick={() => {
            const random = Math.floor(Math.random() * total);
            onSelect(random);
          }}
          className="px-4 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors"
        >
          Surprise me
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs transition-colors"
        >
          cancel
        </button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// ActionButton
// ─────────────────────────────────────────────
interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}
const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onClick,
  disabled,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="flex flex-col items-center justify-center gap-1 py-4 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-25 transition-colors"
  >
    <span className="text-white/70">{icon}</span>
    <span className="text-[10px] text-white/50">{label}</span>
  </button>
);

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────
const FlashcardMobileView: React.FC<FlashcardMobileViewProps> = ({
  cards,
  initialIndex = 0,
  onClose,
  mode = "browse",
  controlledIndex,
  onIndexChange,
  controlledFlipped,
  onFlipToggle,
  onGrade,
  resultsByIndex,
  grading = false,
}) => {
  const isControlledIndex = controlledIndex !== undefined;
  const isControlledFlip = controlledFlipped !== undefined;
  const isStudy = mode === "study";

  const [internalIndex, setInternalIndex] = useState(initialIndex);
  const [internalFlipped, setInternalFlipped] = useState(false);
  const index = isControlledIndex ? controlledIndex : internalIndex;
  const isFlipped = isControlledFlip ? controlledFlipped : internalFlipped;

  const setIndex = useCallback(
    (next: number) => {
      if (isControlledIndex) onIndexChange?.(next);
      else setInternalIndex(next);
    },
    [isControlledIndex, onIndexChange],
  );

  const toggleFlip = useCallback(() => {
    if (isControlledFlip) onFlipToggle?.();
    else setInternalFlipped((f) => !f);
  }, [isControlledFlip, onFlipToggle]);

  const resetFlip = useCallback(() => {
    if (isControlledFlip) {
      if (isFlipped) onFlipToggle?.();
    } else {
      setInternalFlipped(false);
    }
  }, [isControlledFlip, isFlipped, onFlipToggle]);
  const [transition, setTransition] = useState<{
    outgoingIndex: number;
    dir: "left" | "right";
  } | null>(null);
  const [textVisible, setTextVisible] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false); // swipe-up action drawer
  const [scrubOpen, setScrubOpen] = useState(false); // swipe-down filmstrip
  const animTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const total = cards.length;
  const card = cards[index];
  const isAnimating = transition !== null;
  const progress = total > 1 ? (index / (total - 1)) * 100 : 100;

  const goTo = useCallback(
    (nextIndex: number, dir: "left" | "right") => {
      if (isAnimating) return;
      setTextVisible(false);
      setTransition({ outgoingIndex: index, dir });
      resetFlip();
      if (animTimeout.current) clearTimeout(animTimeout.current);
      if (textTimeout.current) clearTimeout(textTimeout.current);
      animTimeout.current = setTimeout(() => {
        setIndex(nextIndex);
        setTransition(null);
        textTimeout.current = setTimeout(() => setTextVisible(true), 40);
      }, ANIM_MS);
    },
    [isAnimating, index, resetFlip, setIndex],
  );

  const goNext = useCallback(() => {
    if (index < total - 1) goTo(index + 1, "left");
  }, [index, total, goTo]);
  const goPrev = useCallback(() => {
    if (index > 0) goTo(index - 1, "right");
  }, [index, goTo]);
  const goFirst = useCallback(() => {
    if (index !== 0) goTo(0, "right");
    setMenuOpen(false);
  }, [index, goTo]);
  const goLast = useCallback(() => {
    if (index !== total - 1) goTo(total - 1, "left");
    setMenuOpen(false);
  }, [index, total, goTo]);

  const shuffle = useCallback(() => {
    if (isStudy) return;
    const next = Math.floor(Math.random() * total);
    if (next !== index) goTo(next, next > index ? "left" : "right");
    setMenuOpen(false);
  }, [index, total, goTo, isStudy]);

  const handleGrade = useCallback(
    (result: ReviewResult) => {
      if (!onGrade || grading) return;
      onGrade(result);
      setMenuOpen(false);
    },
    [onGrade, grading],
  );

  // Matching cards self-grade when every pair is connected; funnel the result
  // through the SAME grade path as a flip (study spine auto-advances).
  const handleMatchingComplete = useCallback(
    (result: ReviewResult) => {
      if (!onGrade) return;
      onGrade(result);
    },
    [onGrade],
  );

  const handleScrubSelect = useCallback(
    (i: number) => {
      setScrubOpen(false);
      if (i !== index) goTo(i, i > index ? "left" : "right");
    },
    [index, goTo],
  );

  // Swipe handlers on the card area
  const cardHandlers = useSwipeable({
    onSwipedLeft: () => {
      if (!menuOpen && !scrubOpen) goNext();
    },
    onSwipedRight: () => {
      if (!menuOpen && !scrubOpen) goPrev();
    },
    onSwipedUp: () => {
      if (scrubOpen) {
        setScrubOpen(false);
        return;
      } // close filmstrip
      if (!menuOpen) {
        setMenuOpen(true);
      } // open drawer
    },
    onSwipedDown: () => {
      if (menuOpen) {
        setMenuOpen(false);
        return;
      } // close drawer
      if (!scrubOpen) {
        setScrubOpen(true);
      } // open filmstrip
    },
    trackMouse: false,
    trackTouch: true,
    delta: 40,
    preventScrollOnSwipe: true,
  });

  // Drawer swipe-down to close
  const drawerHandlers = useSwipeable({
    onSwipedDown: () => setMenuOpen(false),
    trackMouse: false,
    trackTouch: true,
    delta: 30,
    preventScrollOnSwipe: true,
  });

  // Lock body scroll + fullscreen
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      document.body.style.overflow = prev;
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (menuOpen) {
          setMenuOpen(false);
          return;
        }
        if (scrubOpen) {
          setScrubOpen(false);
          return;
        }
        onClose();
      } else if (!menuOpen && !scrubOpen) {
        if (e.key === "ArrowRight") goNext();
        else if (e.key === "ArrowLeft") goPrev();
        else if (e.key === " " || e.key === "Enter") toggleFlip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, onClose, menuOpen, scrubOpen, toggleFlip]);

  useEffect(() => {
    return () => {
      if (animTimeout.current) clearTimeout(animTimeout.current);
      if (textTimeout.current) clearTimeout(textTimeout.current);
    };
  }, []);

  const outgoingExit =
    transition?.dir === "left"
      ? {
          transform: "translateX(-100%)",
          opacity: 0,
          transition: `transform ${ANIM_MS}ms cubic-bezier(0.4,0,0.2,1), opacity ${ANIM_MS}ms ease`,
        }
      : {
          transform: "translateX(100%)",
          opacity: 0,
          transition: `transform ${ANIM_MS}ms cubic-bezier(0.4,0,0.2,1), opacity ${ANIM_MS}ms ease`,
        };

  const incomingEnter =
    transition?.dir === "left"
      ? {
          animation: `mobile-card-enter-right ${ANIM_MS}ms cubic-bezier(0.4,0,0.2,1) both`,
        }
      : {
          animation: `mobile-card-enter-left  ${ANIM_MS}ms cubic-bezier(0.4,0,0.2,1) both`,
        };

  // Card slides up for action drawer, down for filmstrip
  const cardAreaStyle: React.CSSProperties = {
    transform: menuOpen
      ? "translateY(-28%)"
      : scrubOpen
        ? "translateY(28%)"
        : "translateY(0)",
    transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
  };

  const anyPanelOpen = menuOpen || scrubOpen;
  const isMatching = card?.kind === CARD_KIND.matching;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1 select-none shrink-0">
        <button
          onClick={goPrev}
          disabled={index === 0}
          className="p-1.5 rounded-full text-white/60 hover:text-white disabled:opacity-20 transition-opacity"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center gap-0.5">
          <span className="text-white/70 text-xs font-medium">
            {index + 1} / {total}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(total, 11) }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-full transition-all duration-200",
                  i === index % 11
                    ? "w-4 h-1.5 bg-white"
                    : "w-1.5 h-1.5 bg-white/25",
                )}
              />
            ))}
            {total > 11 && (
              <div className="w-1.5 h-1.5 rounded-full bg-white/25" />
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setMenuOpen(false);
              setScrubOpen((s) => !s);
            }}
            className="p-1.5 rounded-full text-white/40 hover:text-white transition-opacity"
            title="Jump to card"
          >
            <Layers className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-white/60 hover:text-white transition-opacity"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Card area — matching cards render the tap-to-pair player (no flip, no
          tap-zone nav so pair taps land); flip cards keep the swipe/tap deck. */}
      {isMatching ? (
        <div
          className="flex-1 relative overflow-y-auto select-none px-3 py-4 flex items-start justify-center"
          style={cardAreaStyle}
        >
          <div className="w-full max-w-md rounded-2xl bg-background p-3 shadow-xl">
            <MatchingCardPlayer
              key={`m-${card.id ?? index}`}
              cardId={card.id ?? String(index)}
              prompt={card.front}
              pairs={card.pairs ?? []}
              disabled={grading}
              onComplete={handleMatchingComplete}
            />
          </div>
        </div>
      ) : (
        <div
          {...cardHandlers}
          className="flex-1 relative overflow-visible select-none"
          style={cardAreaStyle}
          onClick={(e) => {
            if (anyPanelOpen) {
              setMenuOpen(false);
              setScrubOpen(false);
              return;
            }
            if (isAnimating) return;
            const { clientX, currentTarget } = e;
            const { left, width } = currentTarget.getBoundingClientRect();
            const relX = (clientX - left) / width;
            if (relX < 0.2) goPrev();
            else if (relX > 0.8) goNext();
            else toggleFlip();
          }}
        >
          {transition && (
            <CardSlide
              card={cards[transition.outgoingIndex]}
              isFlipped={false}
              style={outgoingExit}
              canGoPrev={transition.outgoingIndex > 0}
              canGoNext={transition.outgoingIndex < total - 1}
              menuOpen={anyPanelOpen}
            />
          )}
          <CardSlide
            card={card}
            isFlipped={isFlipped}
            style={transition ? incomingEnter : undefined}
            showHints
            canGoPrev={index > 0}
            canGoNext={index < total - 1}
            textVisible={textVisible}
            menuOpen={anyPanelOpen}
          />
        </div>
      )}

      {/* ── Filmstrip scrubber (swipe down) — slides in from top ── */}
      <div
        className="absolute top-0 left-0 right-0 z-10 flex flex-col"
        style={{
          transform: scrubOpen ? "translateY(0)" : "translateY(-100%)",
          transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <FilmstripScrubber
          cards={cards}
          activeIndex={index}
          isOpen={scrubOpen}
          onSelect={handleScrubSelect}
          onClose={() => setScrubOpen(false)}
          resultsByIndex={resultsByIndex}
        />
        {/* Scrim below the scrubber — tap to close */}
        <div
          className="h-8 cursor-pointer"
          onClick={() => setScrubOpen(false)}
        />
      </div>

      {/* ── Action drawer (swipe up) ── */}
      <div
        {...drawerHandlers}
        className="absolute bottom-0 left-0 right-0 z-10"
        style={{
          transform: menuOpen ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div
          className="h-8 cursor-pointer"
          onClick={() => setMenuOpen(false)}
        />

        <div className="bg-zinc-900 border-t border-white/10 rounded-t-3xl pb-safe">
          <div className="flex justify-center pt-2 pb-1">
            <GripHorizontal className="h-5 w-5 text-white/40" />
          </div>

          {/* Progress bar */}
          <div className="px-5 pb-3">
            <div className="flex justify-between text-[10px] text-white/50 mb-1">
              <span>Card {index + 1}</span>
              <span>{Math.round(progress)}% through</span>
              <span>{total} total</span>
            </div>
            <div className="h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Action grid */}
          <div className="grid grid-cols-3 gap-px bg-white/5 border-t border-white/5">
            <ActionButton
              icon={<SkipBack className="h-5 w-5" />}
              label="First Card"
              onClick={goFirst}
              disabled={index === 0}
            />
            <ActionButton
              icon={<RotateCcw className="h-5 w-5" />}
              label="Flip Back"
              onClick={() => {
                resetFlip();
                setMenuOpen(false);
              }}
              disabled={!isFlipped}
            />
            <ActionButton
              icon={<SkipForward className="h-5 w-5" />}
              label="Last Card"
              onClick={goLast}
              disabled={index === total - 1}
            />
            <ActionButton
              icon={<ChevronLeft className="h-5 w-5" />}
              label="Previous"
              onClick={() => {
                goPrev();
                setMenuOpen(false);
              }}
              disabled={index === 0}
            />
            {!isStudy ? (
              <ActionButton
                icon={<Shuffle className="h-5 w-5" />}
                label="Random"
                onClick={shuffle}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-1 bg-zinc-900 px-1 py-2">
                <FlashcardGradeButtonRow
                  onGrade={handleGrade}
                  disabled={grading || !onGrade}
                  size="compact"
                  className="w-full max-w-[11rem]"
                />
              </div>
            )}
            <ActionButton
              icon={<ChevronRight className="h-5 w-5" />}
              label="Next"
              onClick={() => {
                goNext();
                setMenuOpen(false);
              }}
              disabled={index === total - 1}
            />
          </div>

          {isStudy && onGrade ? (
            <div className="border-t border-white/5 px-3 py-2">
              <FlashcardGradeButtonRow
                onGrade={handleGrade}
                disabled={grading}
                size="compact"
                className="w-full"
              />
            </div>
          ) : null}

          {/* Jump to card shortcut */}
          <button
            onClick={() => {
              setMenuOpen(false);
              setScrubOpen(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-3 text-blue-400/70 hover:text-blue-400 transition-colors border-t border-white/5"
          >
            <Layers className="h-4 w-4" />
            <span className="text-sm">Jump to Card</span>
          </button>

          <button
            onClick={onClose}
            className="w-full flex items-center justify-center gap-2 py-3 text-red-400/70 hover:text-red-400 transition-colors border-t border-white/5"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Exit Flash Mode</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlashcardMobileView;
