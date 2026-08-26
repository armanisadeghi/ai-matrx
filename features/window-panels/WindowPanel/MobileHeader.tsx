"use client";

/**
 * MobileWindowHeader — slim chrome strip for the fullscreen mobile takeover
 * branch of WindowPanel. Close on the left, sidebar/main toggle
 * (when a sidebar is present) in the center, actions on the right.
 *
 * Extracted from WindowPanel.tsx Phase 6 — purely presentational.
 */
import type { ReactNode } from "react";
import { Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { WINDOW_CHROME_ACTIONS } from "./chromeClasses";

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
  const titleText = typeof title === "string" ? title : "Content";
  return (
    <div className="flex min-h-11 shrink-0 items-center gap-1.5 border-b border-border/50 bg-muted/40 px-2 select-none">
      {/* Close + Minimize */}
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

      {/* Center: sidebar toggle or title */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {hasSidebar ? (
          <div className="inline-flex rounded-lg bg-muted/60 p-0.5 text-xs">
            <button
              type="button"
              className={cn(
                "min-h-11 cursor-pointer whitespace-nowrap rounded-md px-3 py-1 transition-colors",
                activePaneMobile === "sidebar"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => onSetActivePane("sidebar")}
            >
              Sidebar
            </button>
            <button
              type="button"
              className={cn(
                "min-h-11 max-w-[120px] cursor-pointer truncate rounded-md px-3 py-1 transition-colors",
                activePaneMobile === "main"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
              onClick={() => onSetActivePane("main")}
            >
              {titleText}
            </button>
          </div>
        ) : (
          <span className="text-xs font-medium text-foreground/80 truncate">
            {title ?? ""}
          </span>
        )}
      </div>

      {/* Right actions */}
      {actionsRight && (
        <div className={WINDOW_CHROME_ACTIONS}>{actionsRight}</div>
      )}
    </div>
  );
}
