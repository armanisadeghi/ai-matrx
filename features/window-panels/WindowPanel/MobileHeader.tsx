"use client";

/**
 * MobileWindowHeader — chrome for the fullscreen mobile takeover branch of
 * WindowPanel. Row 1: close/minimize + the title, which owns the row and wraps
 * to two lines. Row 2 (only when there is something to show): the
 * Sidebar/Content toggle and the window's actions.
 *
 * Extracted from WindowPanel.tsx Phase 6 — purely presentational.
 */
import type { ReactNode } from "react";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WINDOW_CHROME_ACTIONS } from "./chromeClasses";
import {
  MobileWindowActionsRow,
  MobileWindowTitle,
  MobileWindowTitleRow,
} from "./MobileTitleRow";

interface MobileWindowHeaderProps {
  title?: ReactNode;
  actionsRight?: ReactNode;
  /** Omitted until a mobile minimized tray surface is mounted. */
  onMinimize?: () => void;
  onClose?: () => void;
  hasSidebar: boolean;
  activePaneMobile: "main" | "sidebar";
  onSetActivePane: (pane: "main" | "sidebar") => void;
}

export function MobileWindowHeader({
  title,
  actionsRight,
  onMinimize,
  onClose,
  hasSidebar,
  activePaneMobile,
  onSetActivePane,
}: MobileWindowHeaderProps) {
  // Row 1 is the title's alone (see MobileTitleRow.tsx). The title used to be
  // the Sidebar/Content toggle's own label (`max-w-[120px] truncate`) beside
  // the actions, so "Run History — Recipe Scaler" read "Run History — …". A
  // RICH title (the Chat window's agent picker) is a control and keeps its own
  // layout in the same slot (verifier round 1, F-A1).
  const trafficLights =
    onClose || onMinimize ? (
      <div className="flex items-center gap-1.5 shrink-0">
        {onClose && (
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500">
              <X className="h-2.5 w-2.5 stroke-[3]" style={{ color: "#000" }} />
            </span>
          </button>
        )}
        {onMinimize && (
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center"
            onClick={onMinimize}
            aria-label="Minimize"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-400">
              <Minus
                className="h-2.5 w-2.5 stroke-[3]"
                style={{ color: "#000" }}
              />
            </span>
          </button>
        )}
      </div>
    ) : null;

  const paneToggle = hasSidebar ? (
    <div className="inline-flex shrink-0 rounded-lg bg-muted/60 p-0.5 text-xs">
      {(["sidebar", "main"] as const).map((pane) => (
        <button
          key={pane}
          type="button"
          className={cn(
            "min-h-10 cursor-pointer whitespace-nowrap rounded-md px-3 py-1 transition-colors",
            activePaneMobile === pane
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground",
          )}
          onClick={() => onSetActivePane(pane)}
        >
          {pane === "sidebar" ? "Sidebar" : "Content"}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div className="flex shrink-0 flex-col border-b border-border/50 bg-muted/40 px-2 select-none">
      <MobileWindowTitleRow leading={trafficLights}>
        <MobileWindowTitle title={title} className="pr-1" />
      </MobileWindowTitleRow>
      <MobileWindowActionsRow
        leading={paneToggle}
        actions={
          actionsRight ? (
            <div className={WINDOW_CHROME_ACTIONS}>{actionsRight}</div>
          ) : null
        }
      />
    </div>
  );
}
