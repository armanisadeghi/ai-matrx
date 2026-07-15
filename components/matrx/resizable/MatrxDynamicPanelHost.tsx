"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const MatrxDynamicPanel = dynamic(
  () => import("@/components/matrx/resizable/MatrxDynamicPanel"),
  { ssr: false },
);

type PanelPosition = "left" | "right" | "top" | "bottom";

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
  initialFocus = false,
}: MatrxDynamicPanelHostProps) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPortalTarget(
        document.getElementById("glass-layer") ?? document.body,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!open || dismissDisabled) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, dismissDisabled, onOpenChange]);

  useEffect(() => {
    if (!open || !portalTarget || !initialFocus) return undefined;

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
        requestAnimationFrame(() => returnFocusTo.focus({ preventScroll: true }));
      }
    };
  }, [initialFocus, open, portalTarget]);

  if (!open || !portalTarget) return null;

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
          <div className="flex min-w-0 items-start gap-2">
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
            {headerActions}
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
