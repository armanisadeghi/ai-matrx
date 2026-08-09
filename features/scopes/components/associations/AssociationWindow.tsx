// features/scopes/components/associations/AssociationWindow.tsx
//
// The non-blocking shell for association surfaces on desktop: a draggable,
// resizable `WindowPanel` (same pattern as the canonical `FilePickerWindow`).
// The page behind stays fully interactive — never a blocking Sheet/Dialog.
//
// IMPORT LAZILY. `WindowPanel` asserts it was parsed in a lazy chunk
// (features/window-panels/utils/lazy-bundle-guard). Callers must mount this
// via `next/dynamic({ ssr: false })`, never a static import — see
// features/window-panels FEATURE.md → "Bundle invariant".

"use client";

import { useId, type ReactNode } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

export interface AssociationWindowProps {
  /** Controls mount — callers should also gate their JSX on this. */
  open: boolean;
  onClose: () => void;
  /** Human-readable scope for the window id (debugging / tray labels). */
  scopeId: string;
  title: string;
  /** Small leading icon rendered beside the title. */
  icon?: ReactNode;
  /**
   * One-line context under the header ("Attached to Titanium Marketing").
   * A node, not a string, so the container it names can carry its own door
   * (THE DOOR LAW) instead of being an unreachable label.
   */
  subtitle?: ReactNode;
  children: ReactNode;
}

export function AssociationWindow({
  open,
  onClose,
  scopeId,
  title,
  icon,
  subtitle,
  children,
}: AssociationWindowProps) {
  // Unique per mounted instance — two panels sharing an id fight over one
  // Redux entry and the first unmount kills drag for the survivor.
  const instanceId = useId();

  if (!open) return null;

  return (
    <WindowPanel
      id={`association:${scopeId}:${instanceId}`}
      title={title}
      titleNode={
        icon ? (
          <span className="flex items-center gap-1.5">
            {icon}
            {title}
          </span>
        ) : undefined
      }
      onClose={onClose}
      // The window portals to <body>. Radix surfaces set
      // `pointer-events: none` on <body> while open and can leave it set for
      // a tick after closing — re-assert for our own subtree.
      className="pointer-events-auto"
      width={440}
      height={580}
      minWidth={330}
      minHeight={380}
      position="center"
      bodyClassName="p-0 overflow-hidden"
    >
      <div className="flex h-full min-h-0 flex-col gap-2 p-3">
        {/* A <div>, not a <p>: `subtitle` is a node and may carry an EntityRef
            whose peek renders block content. */}
        {subtitle ? (
          <div className="shrink-0 text-xs text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
        {children}
      </div>
    </WindowPanel>
  );
}

export default AssociationWindow;
