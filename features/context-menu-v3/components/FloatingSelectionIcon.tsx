"use client";

import React from "react";
import { TextSelect } from "lucide-react";

export interface FloatingSelectionIconProps {
  selectionRect: DOMRect | null;
  visible: boolean;
  dropdownOpen: boolean;
  onOpen: (
    e: React.MouseEvent | React.TouchEvent | React.KeyboardEvent,
  ) => void;
  onDismiss: () => void;
}

export function shouldRenderFloatingIcon(
  selectionRect: DOMRect | null,
  visible: boolean,
  dropdownOpen: boolean,
): boolean {
  if (!selectionRect) return false;
  if (!visible && !dropdownOpen) return false;
  if (selectionRect.width <= 0 || selectionRect.height <= 0) return false;
  return true;
}

/**
 * The floating action button that appears just above a text selection and
 * opens the full menu. Hard-won viewport-aware positioning (flip below when
 * there's no room above, clamp horizontally, mouse-fallback rect for textareas)
 * is carried over from v1/v2 — a months-perfected behavior we must not lose.
 * Enterprise icon (Sparkles), not v2's party-popper.
 */
export const FloatingSelectionIcon = React.forwardRef<
  HTMLButtonElement,
  FloatingSelectionIconProps
>(function FloatingSelectionIcon(
  { selectionRect, dropdownOpen, onOpen, onDismiss },
  ref,
) {
  if (!selectionRect) return null;

  const isMobile =
    typeof window !== "undefined" &&
    ("ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768);

  const iconWidth = isMobile ? 48 : 40;
  const iconHeight = isMobile ? 48 : 40;
  const offsetAbove = isMobile ? 12 : 8;

  const centerX = selectionRect.left + selectionRect.width / 2;
  const left = centerX - iconWidth / 2;
  const top = selectionRect.top - iconHeight - offsetAbove;
  const shouldPositionBelow = top < 10;
  const finalTop = shouldPositionBelow
    ? selectionRect.bottom + offsetAbove
    : top;

  const viewportWidth =
    typeof window !== "undefined" ? window.innerWidth : 1024;
  const horizontalPadding = isMobile ? 16 : 10;
  const finalLeft = Math.max(
    horizontalPadding,
    Math.min(left, viewportWidth - iconWidth - horizontalPadding),
  );

  return (
    <button
      ref={ref}
      onClick={onOpen}
      onTouchEnd={(e) => {
        e.preventDefault();
        onOpen(e);
      }}
      className={`fixed z-[9999] flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 ${
        dropdownOpen
          ? "opacity-0 pointer-events-none"
          : "hover:shadow-xl hover:scale-110 active:scale-95 animate-in fade-in slide-in-from-top-2"
      } ${isMobile ? "w-12 h-12" : "w-10 h-10"}`}
      style={{
        left: `${finalLeft}px`,
        top: `${finalTop}px`,
        touchAction: "manipulation",
      }}
      aria-label="Open text actions menu"
      role="button"
      tabIndex={dropdownOpen ? -1 : 0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onOpen(e);
        }
        if (e.key === "Escape") {
          onDismiss();
        }
      }}
    >
      <TextSelect className={isMobile ? "h-6 w-6" : "h-5 w-5"} />
    </button>
  );
});
