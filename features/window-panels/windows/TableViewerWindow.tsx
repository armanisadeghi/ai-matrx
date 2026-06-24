"use client";

// TableViewerWindow — view a markdown table at full size inside a floating
// WindowPanel.
//
// Thin COMPOSITION ROOT (mirrors CanvasViewerWindow): the body holds ONLY the
// table renderer. The same `StreamingTableRenderer` that draws the inline
// (small-UI) table is reused here at a larger font + roomier sizing so a wide
// table is actually readable. Opened from the inline table's "Open in window"
// action, which passes the table markdown through overlay data.

import React, { Suspense, lazy } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";

const StreamingTableRenderer = lazy(() =>
  import("@/components/mardown-display/blocks/table/StreamingTableRenderer").then(
    (m) => ({ default: m.StreamingTableRenderer }),
  ),
);

export interface TableViewerWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** The markdown table content to render. */
  content?: string;
}

export function TableViewerWindow({
  isOpen,
  onClose,
  title = "Table",
  content,
}: TableViewerWindowProps) {
  if (!isOpen) return null;

  // Size to the viewport so the window is "nice and big but always fits".
  // ~85% of the viewport, clamped to a sane max, computed once at open.
  const { width, height } = computeViewportSize();

  return (
    <WindowPanel
      id="table-viewer-window"
      title={title}
      onClose={onClose}
      overlayId="tableViewerWindow"
      minWidth={360}
      minHeight={260}
      width={width}
      height={height}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-auto p-4"
    >
      {content ? (
        <Suspense fallback={<MatrxMiniLoader />}>
          {/* Larger font + complete metadata so the full toolbar shows.
              `expanded` disables the in-window "Open in window" action so the
              user can't recursively open another window from here. */}
          <StreamingTableRenderer
            content={content}
            metadata={{ isComplete: true }}
            fontSize={15}
            expanded
          />
        </Suspense>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No table content to display.
        </div>
      )}
    </WindowPanel>
  );
}

/**
 * Compute a window size that fills most of the screen but always fits, with a
 * comfortable max so it doesn't stretch absurdly wide on large monitors.
 */
function computeViewportSize(): { width: number; height: number } {
  if (typeof window === "undefined") {
    return { width: 900, height: 640 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.round(vw * 0.85), 1400);
  const height = Math.min(Math.round(vh * 0.85), 900);
  return { width, height };
}
