"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { FloatingFrameSize } from "@/components/matrx/resizable/MatrxFloatingFrame";

/**
 * The FLOATING presentation — the lightweight window (drag, resize, Escape,
 * shared z-order, drawer below 768). Lazy so the 59 docked call sites do not
 * pay for it, and `ssr: false` for the same reason the docked panel is.
 */
const MatrxFloatingFrame = dynamic(
  () =>
    import("@/components/matrx/resizable/MatrxFloatingFrame").then(
      (m) => m.MatrxFloatingFrame,
    ),
  { ssr: false },
);

const MatrxDynamicPanel = dynamic(
  () => import("@/components/matrx/resizable/MatrxDynamicPanel"),
  { ssr: false },
);

type PanelPosition = "left" | "right" | "top" | "bottom";

/**
 * How this host puts its content on screen.
 *
 * - `"docked"` (default) — the edge-docked, splitter-resized panel this host
 *   has always been. Every pre-existing call site keeps this, unchanged.
 * - `"floating"` — THE LIGHTWEIGHT WINDOW: a draggable, freely resizable
 *   frame that becomes a bottom drawer below 768 without unmounting its body.
 *   This is the sanctioned host for a picker or a form under
 *   `common-docs/policies/every-picker-takes-new-input.md` §4.
 *
 * There is ONE family, not two: one component, one `open`/`onOpenChange`
 * contract, one Escape and focus contract, one portal. Which presentation a
 * call site wants is a prop, never a second component to choose between.
 */
export type PanelPresentation = "docked" | "floating";

export interface MatrxDynamicPanelHostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  position?: PanelPosition;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  /** Blocks Escape, collapse, and the header close button while true. */
  dismissDisabled?: boolean;
  className?: string;
  expandButtonLabel?: string;
  /** Rendered between the title block and the close button (e.g. toolbar actions). */
  headerActions?: ReactNode;
  /** Wrapper around panel body. Default adds horizontal padding. */
  contentClassName?: string;
  /**
   * Move keyboard focus into the panel when it opens and return focus to the
   * opener when it closes. Opt in for user-invoked form/picker panels; panels
   * that open as passive companions can remain non-disruptive.
   */
  initialFocus?: boolean;
  /** Docked edge panel (default) or the floating lightweight window. */
  presentation?: PanelPresentation;
  /** floating only — preset frame size. */
  floatingSize?: FloatingFrameSize;
  /** floating only — explicit pixel geometry, wins over `floatingSize`. */
  floatingWidth?: number;
  floatingHeight?: number;
  floatingMinWidth?: number;
  floatingMinHeight?: number;
  /** floating only — a footer row rendered below the body. */
  footer?: ReactNode;
  /**
   * floating only — stable id for the shared z-order lane. Defaults to a
   * generated id; pass one when two hosts must keep a deterministic order.
   */
  floatingId?: string;
}

const PANEL_FIELD_SELECTOR = [
  "[data-panel-initial-focus]",
  "input:not([disabled]):not([type='hidden'])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  "[contenteditable='true']",
].join(",");

const PANEL_FALLBACK_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function firstVisibleMatch(
  root: HTMLElement,
  selector: string,
): HTMLElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
      (element) =>
        element.getAttribute("aria-hidden") !== "true" &&
        element.getClientRects().length > 0,
    ) ?? null
  );
}

export function MatrxDynamicPanelHost({
  open,
  onOpenChange,
  title,
  description,
  children,
  position = "right",
  defaultSize = 38,
  minSize = 22,
  maxSize = 88,
  dismissDisabled = false,
  className,
  expandButtonLabel,
  headerActions,
  contentClassName = "px-3 pb-4",
  initialFocus,
  presentation = "docked",
  floatingSize,
  floatingWidth,
  floatingHeight,
  floatingMinWidth,
  floatingMinHeight,
  footer,
  floatingId,
}: MatrxDynamicPanelHostProps) {
  // A floating form window takes focus by default (the law's acceptance
  // script requires it); a docked companion panel stays non-disruptive.
  const focusOnOpen = initialFocus ?? presentation === "floating";
  const isFloating = presentation === "floating";
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPortalTarget(document.getElementById("glass-layer") ?? document.body);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // The floating frame owns Escape (topmost-only, popover-aware).
    if (!open || dismissDisabled || isFloating) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, dismissDisabled, isFloating, onOpenChange]);

  useEffect(() => {
    if (!open || !portalTarget || !focusOnOpen || isFloating) return undefined;

    const returnFocusTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    let retryFrame: number | null = null;
    let retryTimer: number | null = null;

    const focusPreferredTarget = (allowFallbackControls: boolean) => {
      const panel = panelRef.current;
      if (!panel) return false;
      const content =
        panel.querySelector<HTMLElement>("[data-panel-content]") ?? panel;
      const fieldTarget = firstVisibleMatch(content, PANEL_FIELD_SELECTOR);
      const target =
        fieldTarget ??
        (allowFallbackControls
          ? firstVisibleMatch(content, PANEL_FALLBACK_SELECTOR)
          : null) ??
        panel;
      if (!target) return false;

      // A dynamically loaded panel body may appear a frame after the shell.
      // Retry only while focus is still on the opener/shell; never steal it
      // back after the user has already moved into another panel control.
      const active = document.activeElement;
      if (
        active !== document.body &&
        active !== returnFocusTo &&
        active !== panel
      ) {
        return fieldTarget != null;
      }
      target.focus({ preventScroll: true });
      return fieldTarget != null;
    };

    const frame = requestAnimationFrame(() => {
      const foundField = focusPreferredTarget(false);
      if (foundField) return;
      retryFrame = requestAnimationFrame(() => {
        focusPreferredTarget(true);
      });
      retryTimer = window.setTimeout(() => {
        focusPreferredTarget(true);
      }, 120);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (retryFrame != null) cancelAnimationFrame(retryFrame);
      if (retryTimer != null) window.clearTimeout(retryTimer);
      if (returnFocusTo?.isConnected) {
        requestAnimationFrame(() =>
          returnFocusTo.focus({ preventScroll: true }),
        );
      }
    };
  }, [focusOnOpen, isFloating, open, portalTarget]);

  if (!open) return null;

  if (isFloating) {
    // The floating frame owns its own portal, focus, Escape and z-order; the
    // docked hooks above are inert for it (their effects bail on `open` or on
    // the missing panel ref), so nothing double-fires.
    return (
      <MatrxFloatingFrame
        id={floatingId ?? `lite-${titleId}`}
        title={title}
        description={description}
        onClose={() => {
          if (!dismissDisabled) onOpenChange(false);
        }}
        size={floatingSize}
        width={floatingWidth}
        height={floatingHeight}
        minWidth={floatingMinWidth}
        minHeight={floatingMinHeight}
        dismissDisabled={dismissDisabled}
        headerActions={headerActions}
        footer={footer}
        className={className}
        contentClassName={contentClassName}
        initialFocus={focusOnOpen}
      >
        {children}
      </MatrxFloatingFrame>
    );
  }

  if (!portalTarget) return null;

  const collapsedLabel =
    expandButtonLabel ?? (typeof title === "string" ? title : "Panel");

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
    >
      <MatrxDynamicPanel
        initialPosition={position}
        isExpanded
        defaultExpanded
        onExpandedChange={(expanded) => {
          if (!expanded && !dismissDisabled) onOpenChange(false);
        }}
        defaultSize={defaultSize}
        minSize={minSize}
        maxSize={maxSize}
        className={cn(className)}
        expandButtonProps={{ label: collapsedLabel }}
        header={
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <h2
                id={titleId}
                className="truncate text-sm font-semibold text-foreground"
              >
                {title}
              </h2>
              {description ? (
                <p
                  id={descriptionId}
                  className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
                >
                  {description}
                </p>
              ) : null}
            </div>
            {headerActions ? (
              <div className="flex h-6 shrink-0 items-center">
                {headerActions}
              </div>
            ) : null}
          </div>
        }
      >
        <div data-panel-content className={cn(contentClassName)}>
          {children}
        </div>
      </MatrxDynamicPanel>
    </div>
  );

  return createPortal(panel, portalTarget);
}

/** Map a pixel width target to a viewport percentage for MatrxDynamicPanel sizing. */
export function sidePanelWidthToPercent(
  px: number,
  viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440,
  minPct = 22,
  maxPct = 88,
): number {
  const pct = Math.round((px / Math.max(viewportWidth, 1)) * 100);
  return Math.min(maxPct, Math.max(minPct, pct));
}
