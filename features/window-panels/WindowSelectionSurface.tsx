"use client";

// features/window-panels/WindowSelectionSurface.tsx
//
// Every window's body is a selectable surface: text selected anywhere inside a
// window gets the ONE selection toolbar (components/selection-toolbar) — the
// common pair (copy, save to notes) and "AI and more" — and a right-click gets
// the same Alchemy menu as the rest of the app. Mounted once by WindowPanel, so
// every window inherits it; a window whose content has its own, richer menu
// (a note, a chat) is nested inside and its menu wins for its own text.
//
// The menu answers as the nearest SURFACE above the body — the window's own
// when it mounts a `SurfaceRuntimeProvider` (every provider puts an Alchemy
// bridge in the tree); the menu's runtime underlay then reads that surface's
// live values by name. Without this the menu fell back to the ROUTE, and a
// right-click inside the Feedback window offered the Notes page's agents under
// a "Notes" entry (page-pass 2026-09-27). Only the light package hook is read
// here: the surface registry stays out of every window's chunk.

import type { ReactNode } from "react";
import { useContentTransferSurface } from "@ai-matrx/design-system/content-transfer";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export function WindowSelectionSurface({ children }: { children: ReactNode }) {
  const surfaceName = useContentTransferSurface()?.surfaceName ?? undefined;
  // A real element for the menu to slot onto: a window body is often a component that
  // does not forward refs, and a slot onto it would leave no element to hold the text.
  // `display: contents` keeps the body's layout exactly as it was.
  return (
    <NonEditableContextMenu sourceFeature="system" surfaceName={surfaceName}>
      <div className="contents" data-window-selection-surface="">
        {children}
      </div>
    </NonEditableContextMenu>
  );
}
