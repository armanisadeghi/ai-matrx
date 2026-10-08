"use client";
import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ExternalLink,
  Check,
  Palette,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import { useOpenArtifactInCanvas } from "@/features/canvas/hooks/useOpenArtifactInCanvas";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { IconButton } from "@ai-matrx/design-system";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { SlideView, type SlideData, type SlideTheme, type SlideVariant } from "./SlideView";
import { deckFontFamily, PRESET_LIST, presetTheme, resolveDeckTheme } from "./presets";
import { ScaledSlide } from "./ScaledSlide";
import { useCanvasPresentation } from "@ai-matrx/canvas/react";
import { slideThumbnailPlacement } from "@ai-matrx/rich-content/display/blocks/canvas-adaptive";
import { Button } from "@ai-matrx/design-system/controls";

// Lazy load PresentationExportMenu to avoid loading GoogleAPIProvider on initial render
const PresentationExportMenu = lazy(() => import("./PresentationExportMenu"));

export interface PresentationData {
  slides: SlideData[];
  theme: (SlideTheme & { preset?: string }) | undefined | null;
}

/** Per-viewer interaction state persisted for a presentation artifact. */
export interface SlideshowState {
  currentSlide: number;
}

const Slideshow = (
  presentationData: PresentationData & {
    taskId?: string;
    artifactId?: string;
    conversationId?: string;
    messageId?: string;
    blockIndex?: number;
    /** Seed the current slide from persisted state (optional). */
    initialState?: SlideshowState;
    /** Called whenever the user changes interaction state (optional). */
    onStateChange?: (state: SlideshowState) => void;
  },
) => {
  const {
    slides,
    theme,
    artifactId,
    conversationId,
    messageId,
    blockIndex,
    initialState,
    onStateChange,
  } = presentationData;
  // Preset/template → a complete look (variant + palette + font). A live pick
  // wins; otherwise merge the deck's `theme.preset`; otherwise the theme as-is.
  // Visual tier defaults to "fancy" so existing decks instantly look better.
  const [pickedPreset, setPickedPreset] = useState<string | null>(null);
  const effectiveTheme = pickedPreset
    ? presetTheme(pickedPreset)
    : resolveDeckTheme(theme);
  const variant: SlideVariant =
    (effectiveTheme.variant as SlideVariant) || "fancy";
  const activePresetKey =
    pickedPreset ?? (theme?.preset ? String(theme.preset).toLowerCase() : null);
  // Seed the current slide from persisted state when available, clamped to the
  // valid range so a stale index from a shorter deck can't point off the end.
  const [currentSlide, setCurrentSlide] = useState(() => {
    if (initialState) {
      const last = Math.max(0, slides.length - 1);
      return Math.min(Math.max(initialState.currentSlide, 0), last);
    }
    return 0;
  });
  const [direction, setDirection] = useState("next");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  // In a canvas pane the slide scales to fit the pane (aspect kept) with a
  // strip of thumbnails below a portrait pane or beside a wide one. Outside
  // the canvas, and in full screen, the card layout is unchanged.
  const canvasThumbs = slideThumbnailPlacement(useCanvasPresentation());
  const inCanvasLayout = canvasThumbs !== null && !isFullScreen;
  const { open: openCanvas } = useCanvas();
  const { openArtifact } = useOpenArtifactInCanvas();

  const handleOpenCanvas = () => {
    const title = slides[0]?.title || "Presentation";
    const def = getArtifactDef("presentation");

    if (def?.materializable && isMaterializedArtifactId(artifactId)) {
      void openArtifact({
        canvasType: "presentation",
        title,
        content: JSON.stringify({ slides, theme }),
        conversationId,
        messageId,
        artifactId,
        artifactIndex: blockIndex && blockIndex > 0 ? blockIndex : 1,
      });
      return;
    }

    openCanvas({
      type: "presentation",
      data: presentationData,
      metadata: {
        title,
        sourceTaskId: presentationData.taskId,
      },
    });
  };

  // Keep a stable ref to onStateChange so closures don't go stale (updated in
  // an effect, not during render — refs must not be written while rendering).
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  });

  /** Move to a slide and emit the new state to the persistence layer. */
  const applyCurrentSlide = (next: number) => {
    setCurrentSlide(next);
    onStateChangeRef.current?.({ currentSlide: next });
  };

  const goToNext = () => {
    if (currentSlide < slides.length - 1) {
      setDirection("next");
      applyCurrentSlide(currentSlide + 1);
    }
  };

  const goToPrevious = () => {
    if (currentSlide > 0) {
      setDirection("prev");
      applyCurrentSlide(currentSlide - 1);
    }
  };

  const goToSlide = (index: number) => {
    setDirection(index > currentSlide ? "next" : "prev");
    applyCurrentSlide(index);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goToPrevious();
      if (e.key === "ArrowRight") goToNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide]);

  const slide = slides[currentSlide];

  return (
    <>
      {/* Blur backdrop when fullscreen */}
      {isFullScreen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setIsFullScreen(false)}
        />
      )}

      <div
        className={`w-full border border-border ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-4" : inCanvasLayout ? "h-full overflow-hidden" : "rounded-2xl overflow-hidden shadow-xl border-border"}`}
      >
        <div
          className={`bg-textured ${isFullScreen ? "h-full w-full max-w-7xl max-h-[95dvh] rounded-2xl overflow-hidden" : inCanvasLayout ? "h-full w-full" : "w-full"} flex flex-col`}
        >
          {/* Header with Controls */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex flex-wrap items-center gap-0.5 sm:gap-1.5">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className="flex h-11 min-w-11 items-center justify-center rounded-full sm:h-6 sm:min-w-0"
                    aria-label={`Go to slide ${index + 1}`}
                  >
                    <span
                      className="rounded-full transition-all"
                      style={{
                        width: currentSlide === index ? "24px" : "6px",
                        height: "6px",
                        backgroundColor:
                          currentSlide === index
                            ? effectiveTheme.primaryColor
                            : `${effectiveTheme.primaryColor}30`,
                      }}
                    />
                  </button>
                ))}
              </div>
              <div className="text-xs font-medium text-muted-foreground tabular-nums">
                {currentSlide + 1} / {slides.length}
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" icon={<Palette style={{ color: effectiveTheme.primaryColor }} />} aria-label="Theme / template" title="Theme / template" className="sm:min-w-0">
                    <span className="hidden capitalize sm:inline">
                      {PRESET_LIST.find((p) => p.key === activePresetKey)?.name ?? "Theme"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
                  <DropdownMenuLabel className="text-xs">Template</DropdownMenuLabel>
                  {PRESET_LIST.map((p) => (
                    <DropdownMenuItem
                      key={p.key}
                      onClick={() => setPickedPreset(p.key)}
                      className="min-h-11 gap-2 sm:min-h-0"
                    >
                      <span
                        className="h-4 w-4 shrink-0 rounded-full"
                        style={{ background: `linear-gradient(135deg, ${p.primaryColor}, ${p.accentColor})` }}
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm leading-tight">{p.name}</span>
                        <span className="truncate text-[10px] text-muted-foreground">{p.description}</span>
                      </span>
                      {activePresetKey === p.key && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </DropdownMenuItem>
                  ))}
                  {pickedPreset && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setPickedPreset(null)}
                        className="min-h-11 text-xs text-muted-foreground sm:min-h-0"
                      >
                        Reset to deck&apos;s theme
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Suspense fallback={<div className="h-11 w-11 sm:h-7 sm:w-7" />}>
                <PresentationExportMenu
                  presentationData={presentationData}
                  presentationTitle={slides[0]?.title || "presentation"}
                  slideContainerRef={slideContainerRef}
                  slides={slides}
                />
              </Suspense>

              {/* In a canvas pane the deck already IS the canvas and the pane
                  owns Expand — neither button would add anything there. */}
              {!isFullScreen && canvasThumbs === null && (
                <IconButton
                  icon={ExternalLink}
                  tooltip="Open Canvas"
                  onClick={handleOpenCanvas}
                />
              )}

              {(isFullScreen || canvasThumbs === null) && (
                <IconButton
                  icon={isFullScreen ? Minimize2 : Maximize2}
                  tooltip={
                    isFullScreen ? "Exit full screen" : "Expand to full screen"
                  }
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className={
                    isFullScreen
                      ? undefined
                      : "bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700"
                  }
                  variant={isFullScreen ? "outline" : "default"}
                />
              )}
            </div>
          </div>

          {/* Main Slide Area */}
          {inCanvasLayout ? (
            <div
              data-slide-thumbnails={canvasThumbs}
              className={`flex min-h-0 flex-1 ${canvasThumbs === "side" ? "flex-row" : "flex-col"}`}
            >
              {canvasThumbs === "side" && (
                <SlideThumbnails
                  slides={slides}
                  theme={effectiveTheme}
                  variant={variant}
                  current={currentSlide}
                  onPick={goToSlide}
                  placement="side"
                />
              )}
              <div
                ref={slideContainerRef}
                className="relative min-h-0 min-w-0 flex-1 bg-textured p-2"
              >
                <ScaledSlide className="h-full w-full">
                  <div
                    key={currentSlide}
                    className="h-full w-full animate-fadeIn"
                    style={{ fontFamily: deckFontFamily(effectiveTheme.font) }}
                  >
                    <SlideView slide={slide} theme={effectiveTheme} variant={variant} fullScreen={false} />
                  </div>
                </ScaledSlide>
              </div>
              {canvasThumbs === "below" && (
                <SlideThumbnails
                  slides={slides}
                  theme={effectiveTheme}
                  variant={variant}
                  current={currentSlide}
                  onPick={goToSlide}
                  placement="below"
                />
              )}
            </div>
          ) : (
          <div
            ref={slideContainerRef}
            className={`flex-1 flex items-center justify-center relative overflow-hidden bg-textured ${isFullScreen ? "py-5 px-2 min-h-[600px]" : "py-3 px-2 min-h-[350px]"}`}
          >
            <div
              key={currentSlide}
              className={`w-full animate-fadeIn ${isFullScreen ? "max-w-6xl mx-auto" : "max-w-4xl mx-auto"}`}
            >
              <div className="aspect-[16/9] w-full" style={{ fontFamily: deckFontFamily(effectiveTheme.font) }}>
                <SlideView
                  slide={slide}
                  theme={effectiveTheme}
                  variant={variant}
                  fullScreen={isFullScreen}
                />
              </div>
            </div>
          </div>

          )}

          {/* Bottom Navigation Bar with Arrow Buttons */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between gap-3">
              <Button variant="quiet" icon={<ChevronLeft />} onClick={goToPrevious} disabled={currentSlide === 0}>
                <span>Previous</span>
              </Button>

              <button
                onClick={goToNext}
                disabled={currentSlide === slides.length - 1}
                className={`min-h-11 px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-2 sm:min-h-0 ${
                  currentSlide === slides.length - 1
                    ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed text-gray-400 dark:text-gray-600"
                    : "bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
                } ${isFullScreen ? "text-base" : "text-sm"}`}
              >
                <span>Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* CSS for animations */}
          <style>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(20px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            @keyframes slideIn {
              from {
                opacity: 0;
                transform: translateX(-20px);
              }
              to {
                opacity: 1;
                transform: translateX(0);
              }
            }

            .animate-fadeIn {
              animation: fadeIn 0.5s ease-out;
            }
          `}</style>
        </div>
      </div>
    </>
  );
};

export default Slideshow;

/** The deck's slides as small scaled previews: a row below a portrait pane, a column beside a wide one. */
function SlideThumbnails({
  slides,
  theme,
  variant,
  current,
  onPick,
  placement,
}: {
  slides: SlideData[];
  theme: SlideTheme;
  variant: SlideVariant;
  current: number;
  onPick: (index: number) => void;
  placement: "below" | "side";
}) {
  return (
    <div
      aria-label="Slides"
      className={
        placement === "side"
          ? "flex w-36 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border bg-muted/30 p-2"
          : "flex shrink-0 flex-row gap-2 overflow-x-auto border-t border-border bg-muted/30 p-2"
      }
    >
      {slides.map((s, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onPick(index)}
          aria-label={`Go to slide ${index + 1}`}
          aria-current={index === current ? "true" : undefined}
          className={`relative shrink-0 overflow-hidden rounded-md border-2 transition-colors ${
            placement === "side" ? "w-full" : "w-28"
          } ${index === current ? "border-primary" : "border-transparent hover:border-border"}`}
        >
          <ScaledSlide className="pointer-events-none aspect-video w-full">
            <div className="h-full w-full" style={{ fontFamily: deckFontFamily(theme.font) }}>
              <SlideView slide={s} theme={theme} variant={variant} fullScreen={false} />
            </div>
          </ScaledSlide>
          <span className="absolute bottom-0.5 left-1 rounded bg-background/80 px-1 text-[10px] tabular-nums text-muted-foreground">
            {index + 1}
          </span>
        </button>
      ))}
    </div>
  );
}
