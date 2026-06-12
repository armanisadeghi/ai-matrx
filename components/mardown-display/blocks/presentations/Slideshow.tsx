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

// Lazy load PresentationExportMenu to avoid loading GoogleAPIProvider on initial render
const PresentationExportMenu = lazy(() => import("./PresentationExportMenu"));

// Helper to parse markdown bold syntax
const parseMarkdown = (text) => {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
};

export interface PresentationData {
  slides: any[];
  theme: any;
}

const Slideshow = (
  presentationData: PresentationData & { taskId?: string },
) => {
  const { slides, theme } = presentationData;
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState("next");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const slideContainerRef = useRef<HTMLDivElement>(null);
  const { open: openCanvas } = useCanvas();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowLeft") goToPrevious();
      if (e.key === "ArrowRight") goToNext();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide]);

  const goToNext = () => {
    if (currentSlide < slides.length - 1) {
      setDirection("next");
      setCurrentSlide(currentSlide + 1);
    }
  };

  const goToPrevious = () => {
    if (currentSlide > 0) {
      setDirection("prev");
      setCurrentSlide(currentSlide - 1);
    }
  };

  const goToSlide = (index) => {
    setDirection(index > currentSlide ? "next" : "prev");
    setCurrentSlide(index);
  };

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
        className={`w-full ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-4" : "rounded-2xl overflow-hidden shadow-xl border-border"}`}
      >
        <div
          className={`bg-textured ${isFullScreen ? "h-full w-full max-w-7xl max-h-[95dvh] rounded-2xl overflow-hidden" : "w-full"} flex flex-col`}
        >
          {/* Header with Controls */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-border flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900">
            <div className="flex items-center gap-3">
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
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 ml-2">
                {currentSlide + 1} / {slides.length}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Export Menu - Lazy loaded to avoid GoogleAPIProvider on initial render */}
              <Suspense fallback={<div className="w-8 h-8" />}>
                <PresentationExportMenu
                  presentationData={presentationData}
                  presentationTitle={slides[0]?.title || "presentation"}
                  slideContainerRef={slideContainerRef}
                  slides={slides}
                />
              </Suspense>

              {/* Canvas Button - Only show when not in fullscreen */}
              {!isFullScreen && (
                <button
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
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-700 text-white text-xs font-medium transition-all shadow-sm"
                  title="Open in side panel"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Canvas</span>
                </button>
              )}

              {/* Fullscreen Toggle */}
              <button
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition-all shadow-sm"
              >
                {isFullScreen ? (
                  <>
                    <Minimize2 className="h-3.5 w-3.5" />
                    <span>Exit</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="h-3.5 w-3.5" />
                    <span>Fullscreen</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Main Slide Area */}
          <div
            ref={slideContainerRef}
            className={`flex-1 flex items-center justify-center relative overflow-hidden bg-textured ${isFullScreen ? "p-8 min-h-[600px]" : "p-6 min-h-[550px]"}`}
          >
            <div
              key={currentSlide}
              className={`w-full animate-fadeIn ${isFullScreen ? "max-w-5xl" : "max-w-3xl"}`}
            >
              {slide.type === "intro" ? (
                <div className="text-center space-y-6">
                  <div
                    className="inline-block px-4 py-1.5 rounded-full text-xs font-semibold mb-3"
                    style={{
                      backgroundColor: `${theme.primaryColor}20`,
                      color: theme.primaryColor,
                    }}
                  >
                    Introduction
                  </div>
                  <h1
                    className={`font-bold leading-tight mb-4 text-gray-900 dark:text-gray-100 ${isFullScreen ? "text-5xl" : "text-3xl"}`}
                    style={{ color: theme.primaryColor }}
                  >
                    {parseMarkdown(slide.title)}
                  </h1>
                  <p
                    className={`leading-relaxed opacity-80 max-w-2xl mx-auto text-gray-700 dark:text-gray-300 ${isFullScreen ? "text-xl" : "text-base"}`}
                  >
                    {parseMarkdown(slide.subtitle)}
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Title and Description - min 2 lines of text */}
                  <div
                    className={isFullScreen ? "min-h-[120px]" : "min-h-[80px]"}
                  >
                    <h2
                      className={`font-bold mb-3 text-gray-900 dark:text-gray-100 ${isFullScreen ? "text-4xl" : "text-2xl"}`}
                      style={{ color: theme.primaryColor }}
                    >
                      {parseMarkdown(slide.title)}
                    </h2>
                    <p
                      className={`opacity-75 leading-relaxed text-gray-700 dark:text-gray-300 ${isFullScreen ? "text-lg" : "text-sm"}`}
                    >
                      {parseMarkdown(slide.description)}
                    </p>
                  </div>

                  {/* Bullets - min space for 5 bullets */}
                  <div
                    className={`space-y-3 mt-6 ${isFullScreen ? "min-h-[280px]" : "min-h-[240px]"}`}
                  >
                    {slide.bullets.map((bullet, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg transition-all hover:translate-x-1 bg-gray-50 dark:bg-gray-800/50"
                        style={{
                          animation: `slideIn 0.5s ease-out ${i * 0.1}s both`,
                        }}
                      >
                        <div
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${isFullScreen ? "mt-3" : "mt-2.5"}`}
                          style={{ backgroundColor: theme.primaryColor }}
                        />
                        <p
                          className={`leading-relaxed text-gray-800 dark:text-gray-200 ${isFullScreen ? "text-base" : "text-sm"}`}
                        >
                          {parseMarkdown(bullet)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Navigation Bar with Arrow Buttons */}
          <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={goToPrevious}
                disabled={currentSlide === 0}
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
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
                className={`px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2 ${
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
