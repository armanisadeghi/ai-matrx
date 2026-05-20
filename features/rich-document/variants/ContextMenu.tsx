"use client";

// features/rich-document/variants/ContextMenu.tsx
//
// The right-click context menu body. Lazily loaded by ContextMenuMount on
// the first non-streaming right-click (next/dynamic), so its chunk — and
// the Radix dropdown machinery — never ships until the user actually wants
// it. Renders the SAME two-level hierarchy as the overflow menu via the
// shared DropdownMenuTree.
//
// Implemented as a CONTROLLED Radix DropdownMenu anchored to a zero-size
// fixed trigger at the cursor coordinates — avoids needing a separate
// ContextMenu primitive while reusing all the submenu rendering.

import * as React from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { buildMenuTree } from "./shared/menuStructure";
import { DropdownMenuTree } from "./shared/DropdownMenuTree";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

export interface ContextMenuProps {
  actions: RichDocumentAction[];
  getCtx: () => RichDocumentActionContext;
  /** Cursor coordinates (viewport-relative) where the menu should anchor. */
  x: number;
  y: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContextMenu(props: ContextMenuProps): React.ReactElement {
  const { actions, getCtx, x, y, open, onOpenChange } = props;
  const ctxForLabels = getCtx();
  const tree = buildMenuTree(actions);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      {/* Zero-size virtual trigger positioned at the cursor. */}
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: x,
            top: y,
            width: 0,
            height: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuTree
          tree={tree}
          getCtx={getCtx}
          ctxForLabels={ctxForLabels}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default ContextMenu;
