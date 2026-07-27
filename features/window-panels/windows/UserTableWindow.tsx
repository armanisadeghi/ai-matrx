"use client";

// UserTableWindow — view a saved, live UDT dataset table at full size inside a
// floating WindowPanel.
//
// Sibling of TableViewerWindow: that one hosts a markdown table string; THIS one
// hosts a persisted `udt_datasets` table by id via the realtime UserTableViewer
// (edit, sort, filter, paginate — the real thing). Opened from the converted
// chat-artifact table's "Open in window" action, which passes the table id
// through overlay data.

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";

const UserTableViewer = dynamic(() => import("@/components/user-generated-table-data/UserTableViewer"), { ssr: false, loading: () => <MatrxMiniLoader /> });

export interface UserTableWindowProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** The `udt_datasets` table id to render. */
  tableId?: string;
}

export function UserTableWindow({
  isOpen,
  onClose,
  title = "Table",
  tableId,
}: UserTableWindowProps) {
  if (!isOpen) return null;

  // Size to the viewport so the window is "nice and big but always fits".
  const { width, height } = computeViewportSize();

  return (
    <WindowPanel
      id="user-table-window"
      title={title}
      onClose={onClose}
      overlayId="userTableWindow"
      minWidth={420}
      minHeight={300}
      width={width}
      height={height}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-auto p-4"
    >
      {tableId ? (
        <Suspense fallback={<MatrxMiniLoader />}>
          {/* The window's chrome already names the table, so suppress the
              viewer's own title header (no double title). */}
          <UserTableViewer tableId={tableId} renderCellMarkdown hideHeader />
        </Suspense>
      ) : (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No table to display.
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
    return { width: 1000, height: 680 };
  }
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(Math.round(vw * 0.85), 1500);
  const height = Math.min(Math.round(vh * 0.85), 920);
  return { width, height };
}
