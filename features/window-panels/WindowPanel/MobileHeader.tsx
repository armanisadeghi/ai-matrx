"use client";

/**
 * MobileWindowHeader — slim chrome strip for the fullscreen mobile takeover
 * branch of WindowPanel. Close + minimize on the left, sidebar/main toggle
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
  onMinimize: () => void;
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
    <div className="flex items-center gap-1.5 px-2 py-1.5 min-h-[36px] shrink-0 border-b border-border/50 bg-muted/40 select-none">
      {/* Close + Minimize */}
      <div className="flex items-center gap-1.5 shrink-0">
        {onClose && (
          <button
            type="button"
            className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="w-2.5 h-2.5 stroke-[3]" style={{ color: "#000" }} />
          </button>
        )}
        <button
          type="button"
          className="w-6 h-6 rounded-full bg-yellow-400 flex items-center justify-center cursor-pointer"
          onClick={onMinimize}
          aria-label="Minimize"
        >
          <Minus className="w-2.5 h-2.5 stroke-[3]" style={{ color: "#000" }} />
        </button>
      </div>

      {/* Center: sidebar toggle or title */}
      <div className="flex-1 flex items-center justify-center min-w-0">
        {hasSidebar ? (
          <div className="inline-flex rounded-lg bg-muted/60 p-0.5 text-xs">
            <button
              type="button"
              className={cn(
                "px-3 py-1 rounded-md transition-colors whitespace-nowrap cursor-pointer",
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
                "px-3 py-1 rounded-md transition-colors truncate max-w-[120px] cursor-pointer",
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
