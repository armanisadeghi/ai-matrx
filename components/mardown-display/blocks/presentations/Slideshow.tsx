"use client";
import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ExternalLink,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import IconButton from "@/components/official/IconButton";

import { SlideView, type SlideVariant } from "./SlideView";

// Lazy load PresentationExportMenu to avoid loading GoogleAPIProvider on initial render
const PresentationExportMenu = lazy(() => import("./PresentationExportMenu"));

export interface PresentationData {
  slides: any[];
  theme: any;
}

/** Per-viewer interaction state persisted for a presentation artifact. */
export interface SlideshowState {
  currentSlide: number;
}

const Slideshow = (
  presentationData: PresentationData & {
    taskId?: string;
    /** Seed the current slide from persisted state (optional). */
    initialState?: SlideshowState;
    /** Called whenever the user changes interaction state (optional). */
    onStateChange?: (state: SlideshowState) => void;
  },
) => {
  const { slides, theme, initialState, onStateChange } = presentationData;
  // Visual tier: "generic" (clean) | "fancy" (default — gradients, layouts) |
  // "deluxe" (fancy + imagery). Read from the theme; default to "fancy" so
  // existing decks instantly look better.
  const variant: SlideVariant = ((theme?.variant as SlideVariant) ||
    "fancy") as SlideVariant;
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
  const { open: openCanvas } = useCanvas();

  // Keep a stable ref to onStateChange so closures don't go stale.
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

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

  const goToSlide = (index) => {
    setDirection(index > currentSlide ? "next" : "prev");
    applyCurrentSlide(index);
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
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
        className={`w-full border border-border ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-4" : "rounded-2xl overflow-hidden shadow-xl border-border"}`}
      >
        <div
          className={`bg-textured ${isFullScreen ? "h-full w-full max-w-7xl max-h-[95dvh] rounded-2xl overflow-hidden" : "w-full"} flex flex-col`}
        >
          {/* Header with Controls */}
          <div className="flex-shrink-0 px-3 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5">
                {slides.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className="transition-all rounded-full"
                    style={{
                      width: currentSlide === index ? "24px" : "6px",
                      height: "6px",
                      backgroundColor:
                        currentSlide === index
                          ? theme.primaryColor
                          : `${theme.primaryColor}30`,
                    }}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
              <div className="text-xs font-medium text-muted-foreground tabular-nums">
                {currentSlide + 1} / {slides.length}
              </div>
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <Suspense fallback={<div className="h-7 w-7" />}>
                <PresentationExportMenu
                  presentationData={presentationData}
                  presentationTitle={slides[0]?.title || "presentation"}
                  slideContainerRef={slideContainerRef}
                  slides={slides}
                />
              </Suspense>

              {!isFullScreen && (
                <IconButton
                  icon={ExternalLink}
                  tooltip="Open Canvas"
                  onClick={() =>
                    openCanvas({
                      type: "presentation",
                      data: presentationData,
                      metadata: {
                        title: slides[0]?.title || "Presentation",
                        sourceTaskId: presentationData.taskId,
                      },
                    })
                  }
                  size="sm"
                  className="bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700"
                />
              )}

              <IconButton
                icon={isFullScreen ? Minimize2 : Maximize2}
                tooltip={
                  isFullScreen ? "Exit full screen" : "Expand to full screen"
                }
                onClick={() => setIsFullScreen(!isFullScreen)}
                size="sm"
                className={
                  isFullScreen
                    ? undefined
                    : "bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700"
                }
                variant={isFullScreen ? "outline" : "default"}
              />
            </div>
          </div>

          {/* Main Slide Area */}
          <div
            ref={slideContainerRef}
            className={`flex-1 flex items-center justify-center relative overflow-hidden bg-textured ${isFullScreen ? "py-5 px-2 min-h-[600px]" : "py-3 px-2 min-h-[350px]"}`}
          >
            <div
              key={currentSlide}
              className={`w-full animate-fadeIn ${isFullScreen ? "max-w-6xl mx-auto" : "max-w-4xl mx-auto"}`}
            >
              <div className="aspect-[16/9] w-full">
                <SlideView
                  slide={slide}
                  theme={theme}
                  variant={variant}
                  fullScreen={isFullScreen}
                />
              </div>
            </div>
          </div>

          {/* Bottom Navigation Bar with Arrow Buttons */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={goToPrevious}
                disabled={currentSlide === 0}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  currentSlide === 0
                    ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed text-gray-400 dark:text-gray-600"
                    : "bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
                } ${isFullScreen ? "text-base" : "text-sm"}`}
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous</span>
              </button>

              <button
                onClick={goToNext}
                disabled={currentSlide === slides.length - 1}
                className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-2 ${
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
