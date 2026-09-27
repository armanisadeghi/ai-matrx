"use client";

// features/window-panels/WindowSelectionSurface.tsx
//
// Every window's body is a selectable surface: text selected anywhere inside a
// window gets the ONE selection toolbar (components/selection-toolbar) — the
// common pair (copy, save to notes) and "AI and more" — and a right-click gets
// the same Alchemy menu as the rest of the app. Mounted once by WindowPanel, so
// every window inherits it; a window whose content has its own, richer menu
// (a note, a chat) is nested inside and its menu wins for its own text.

import type { ReactNode } from "react";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export function WindowSelectionSurface({ children }: { children: ReactNode }) {
  return <NonEditableContextMenu sourceFeature="system">{children}</NonEditableContextMenu>;
}
