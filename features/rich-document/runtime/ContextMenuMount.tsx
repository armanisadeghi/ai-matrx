"use client";

// features/rich-document/runtime/ContextMenuMount.tsx
//
// Lightweight wrapper that adds an optional right-click context menu to
// RichDocument content. Two hard requirements drive the design:
//
//   1. ZERO COST DURING STREAMING — while `isStreamActive`, the handler is a
//      no-op and the NATIVE browser context menu shows (copy / inspect /
//      etc. stay available). The rich menu only takes over once streaming
//      ends.
//   2. LAZY — the real <ContextMenu/> (Radix dropdown machinery + the menu
//      tree) is loaded via next/dynamic only after the first non-streaming
//      right-click. Cold pages never ship the chunk.
//
// This file itself imports nothing heavy, so wrapping content in it is
// effectively free until the user right-clicks.

import * as React from "react";
import dynamic from "next/dynamic";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

// Lazy — the chunk loads on first right-click, never before.
const ContextMenu = dynamic(
  () =>
    import("../variants/ContextMenu").then((m) => ({
      default: m.ContextMenu,
    })),
  { ssr: false, loading: () => null },
);

export interface ContextMenuMountProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  /** While true, right-click yields to the native browser menu. */
  isStreamActive?: boolean;
  children: React.ReactNode;
}

export function ContextMenuMount(
  props: ContextMenuMountProps,
): React.ReactElement {
  const { actions, getCtx, isStreamActive, children } = props;

  // `armed` flips true on the first non-streaming right-click → mounts the
  // lazy <ContextMenu/>. Stays mounted afterward (controlled open/close).
  const [armed, setArmed] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    // Streaming → let the native menu through. No preventDefault.
    if (isStreamActive) return;
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
    setArmed(true);
    setOpen(true);
  };

  return (
    // `contents` keeps this wrapper out of layout; right-click events from
    // children still bubble to this handler.
    <div className="contents" onContextMenu={handleContextMenu}>
      {children}
      {armed ? (
        // key on position forces a fresh anchor when the user right-clicks
        // a different spot while the menu is already open.
        <ContextMenu
          key={`${pos.x},${pos.y}`}
          actions={actions}
          getCtx={getCtx}
          x={pos.x}
          y={pos.y}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </div>
  );
}

export default ContextMenuMount;
