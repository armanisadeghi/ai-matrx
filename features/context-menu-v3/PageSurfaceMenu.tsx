"use client";

// features/context-menu-v3/PageSurfaceMenu.tsx
//
// THE PAGE-LEVEL MENU FLOOR. A page whose body is cards / charts / panels (no
// table, no editor) has no right-click region, so a right-click on it opens
// NOTHING and the person loses Copy, Agents, Surface Context and Bind. Mount
// this ONCE in the section shell that wraps those pages: it resolves the live
// surface the page registered (`useActivePageSurface`, the same answer the
// header Agents menu uses) and answers with the canonical read-only menu bound
// to that surface and its live scope. A deeper menu (table rows, editors)
// still wins (innermost-wins), so wrapping never shadows a richer one.

import type { ReactNode } from "react";
import { useActivePageSurface } from "@ai-matrx/chat/surfaces/runtime/useActivePageSurface";
import { NonEditableContextMenu } from "./NonEditableContextMenu";

type MenuProps = Parameters<typeof NonEditableContextMenu>[0];

export function PageSurfaceMenu({
  sourceFeature,
  children,
}: {
  sourceFeature: MenuProps["sourceFeature"];
  children: ReactNode;
}) {
  const active = useActivePageSurface();
  return (
    <NonEditableContextMenu
      sourceFeature={sourceFeature}
      surfaceName={active.surfaceName ?? undefined}
      getApplicationScope={() => {
        const scope = active.runtime?.getScope();
        // The menu reads the scope synchronously; an async scope is read by the Surface Context window.
        return scope && !(scope instanceof Promise) ? scope : {};
      }}
      contentSource={{ type: "raw" }}
      contextData={{ content: "" }}
    >
      {children}
    </NonEditableContextMenu>
  );
}
