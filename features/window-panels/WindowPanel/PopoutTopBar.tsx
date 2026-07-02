"use client";

/**
 * PopoutTopBar — slim chrome strip for window content that has been popped
 * out into a Document Picture-in-Picture (or `window.open`) browser window.
 *
 * The OS / browser frame already provides close + minimize at the window
 * manager level, so this strip omits traffic lights entirely. Its only job
 * is to show the title, optional actions, and a "Dock back" button that
 * returns the content to the parent viewport.
 *
 * Extracted as a sibling of `MobileHeader.tsx` — purely presentational, no
 * Redux or hook dependencies. The dock + close handlers are passed in by
 * `WindowPanel` so the same component covers both the docked and popped-out
 * render paths cleanly.
 */
import type { ReactNode } from "react";
import { ArrowLeftToLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { WINDOW_CHROME_ACTIONS } from "./chromeClasses";

export interface PopoutTopBarProps {
  /** Title displayed centered in the bar. Accepts string or arbitrary node. */
  title?: ReactNode;
  /** Optional content slotted on the left, before the title. */
  actionsLeft?: ReactNode;
  /** Optional content slotted on the right, before the dock button. */
  actionsRight?: ReactNode;
  /**
   * Click handler for the dock button. Should dispatch `dockWindow({ id, viewportWidth, viewportHeight })`
   * so the window returns centered in the parent viewport.
   * The browser popout window itself is closed by the `usePopoutWindow`
   * lifecycle hook in response to the Redux state change.
   */
  onDock: () => void;
}

/**
 * Visual height: 32px. Background mirrors the docked header (`bg-muted/40`)
 * so themes carry over via the cloned stylesheet without any popout-specific
 * styles.
 */
export function PopoutTopBar({
  title,
  actionsLeft,
  actionsRight,
  onDock,
}: PopoutTopBarProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 min-h-[32px] shrink-0",
        "border-b border-border/50 bg-muted/40 select-none",
      )}
    >
      {/* Left actions */}
      {actionsLeft && (
        <div className={WINDOW_CHROME_ACTIONS}>{actionsLeft}</div>
      )}

      {/* Centered title */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        <span className="text-xs font-medium text-foreground/80 truncate">
          {title ?? ""}
        </span>
      </div>

      {/* Right actions */}
      {actionsRight && (
        <div className={WINDOW_CHROME_ACTIONS}>{actionsRight}</div>
      )}

      {/* Dock back button — always last, visually anchors the right side */}
      <button
        type="button"
        className={cn(
          "ml-1 p-1 rounded hover:bg-accent/60 transition-colors shrink-0 cursor-pointer",
          "text-foreground/60 hover:text-foreground",
        )}
        onClick={onDock}
        title="Dock window"
        aria-label="Dock window back to parent"
      >
        <ArrowLeftToLine className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
