"use client";

/**
 * DiffViewerWindow
 *
 * A movable / resizable WindowPanel wrapper around the canonical headless
 * `DiffViewer` core (`components/diff/DiffViewer`). This is ONLY chrome —
 * all diff logic lives in the core, so the same component also renders as
 * a route, modal, sheet, or inline region without this wrapper.
 *
 * Multi-instance + ephemeral: every "Compare …" action spawns a fresh
 * window, and live comparisons are not persisted across reloads.
 */

import React from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { DiffViewer, type DiffEngine } from "@/components/diff/DiffViewer";

export interface DiffViewerWindowProps {
  windowInstanceId: string;
  onClose: () => void;

  original: string;
  modified: string;
  originalLabel?: string;
  modifiedLabel?: string;
  title?: string | null;
  engine?: DiffEngine;
  language?: string;
  defaultView?: "split" | "inline";
}

export default function DiffViewerWindow({
  windowInstanceId,
  onClose,
  original,
  modified,
  originalLabel,
  modifiedLabel,
  title,
  engine = "auto",
  language,
  defaultView = "split",
}: DiffViewerWindowProps) {
  return (
    <WindowPanel
      id={`diff-viewer-window-${windowInstanceId}`}
      title={title ?? "Compare"}
      overlayId="diffViewerWindow"
      minWidth={520}
      minHeight={360}
      width={1000}
      height={640}
      onClose={onClose}
    >
      <div className="flex h-full w-full overflow-hidden bg-background">
        <DiffViewer
          original={original}
          modified={modified}
          originalLabel={originalLabel}
          modifiedLabel={modifiedLabel}
          engine={engine}
          language={language}
          defaultView={defaultView}
          className="flex-1 min-w-0"
        />
      </div>
    </WindowPanel>
  );
}
