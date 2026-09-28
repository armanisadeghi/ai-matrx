"use client";

/**
 * MobileCardSurface — mobile presentation for a window with
 * `mobilePresentation: "card"`.
 *
 * Small, z-stacked floating card anchored to the bottom-right of the
 * viewport. Used for utility/debug windows (Stream Debug, State Analyzer,
 * Message Analysis, JSON Truncator) that only need a peek view on mobile.
 *
 * Differences from MobileDrawerSurface:
 *  - Non-modal: the underlying content remains interactive.
 *  - Compact default size (w-[92vw] max-w-[420px], h-[60dvh]).
 *  - Dismiss on outside tap, Escape, or X button.
 *  - No sidebar support (these windows don't need one).
 */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FloatingLayer, useFloatingLayerZIndex } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface MobileCardSurfaceProps {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  isOpen: boolean;
  actionsRight?: ReactNode;
  bodyClassName?: string;
  /** Marks the root `data-surface-layer` (see WindowPanel `surfaceLayer`). */
  surfaceLayer?: string;
  /** Override the default max-height (60dvh). Accepts any CSS length. */
  maxHeight?: string;
}

export default function MobileCardSurface({
  title,
  children,
  onClose,
  footer,
  isOpen,
  actionsRight,
  bodyClassName,
  surfaceLayer,
  maxHeight = "60dvh",
}: MobileCardSurfaceProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e: KeyboardEvent) => {
      // One Escape closes ONE layer (a menu inside already took it).
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Opened from inside a blocking sheet (every Dialog is one on a phone), the
  // card is lifted above its scrim (design-system floating-layer).
  const zIndex = useFloatingLayerZIndex(9999);

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <FloatingLayer>
    <div
      ref={cardRef}
      data-surface-layer={surfaceLayer}
      role="dialog"
      aria-modal="false"
      className={cn(
        "fixed right-3 bottom-3 left-3 sm:left-auto sm:right-3",
        "w-auto sm:w-[92vw] sm:max-w-[420px]",
        "flex flex-col",
        "rounded-xl overflow-hidden",
        "bg-card/97 backdrop-blur-xl border border-border/60 shadow-2xl",
        // Themes can override via --window-surface-* tokens in globals.css
        "animate-[card-enter_var(--window-surface-enter-duration,220ms)_var(--window-surface-easing,ease-out)]",
      )}
      style={{ maxHeight, zIndex, paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/50 shrink-0">
        <span className="flex-1 text-xs font-medium truncate">{title}</span>
        <div className="flex items-center gap-1 shrink-0">
          {actionsRight}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className={cn("flex-1 min-h-0 overflow-auto", bodyClassName)}>
        {children}
      </div>

      {footer && (
        <div className="border-t border-border/50 shrink-0">{footer}</div>
      )}
    </div>
    </FloatingLayer>,
    document.body,
  );
}
