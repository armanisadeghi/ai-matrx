// features/window-panels/detail/shells/DetailWindowShell.tsx
//
// The WINDOW shell for the Detail primitive: `WindowPanel`, this app's window
// manager — tray docking, workspace persistence, shared z-order, mobile
// routing (`mobilePresentation: "drawer"` from the registry metadata), and the
// `?panels=detail:<type>.<id>:as-window` deep link through `urlSync`. The lib
// fills the slots; nothing about the record is decided here.
//
// PARSES `WindowPanel` — lazy only. Reached through the `detailWindow`
// overlay's `lazyOverlay` entry (`windows/detail/DetailWindow.tsx`), never
// from a route or a boot module.

"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import type { DetailWindowShellProps } from "@/lib/detail/host";
import { DETAIL_URL_AS_ARG, DETAIL_URL_TYPE_KEY } from "@/lib/detail/presentation";

export function DetailWindowShell({
  instanceKey,
  title,
  titleNode,
  actions,
  onClose,
  children,
}: DetailWindowShellProps) {
  return (
    <WindowPanel
      id="detail-window"
      overlayId="detailWindow"
      title={title}
      titleNode={titleNode}
      actionsRight={actions}
      onClose={onClose}
      width={560}
      height={640}
      minWidth={360}
      minHeight={320}
      bodyClassName="overflow-y-auto"
      urlSyncKey={DETAIL_URL_TYPE_KEY}
      urlSyncId={instanceKey}
      urlSyncArgs={{ [DETAIL_URL_AS_ARG]: "window" }}
    >
      {children}
    </WindowPanel>
  );
}
