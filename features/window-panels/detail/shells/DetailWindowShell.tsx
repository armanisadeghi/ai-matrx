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
import {
  DETAIL_URL_AS_ARG,
  DETAIL_URL_TYPE_KEY,
  detailListToUrlArgs,
  panelUrlReserveBytes,
} from "@ai-matrx/detail";
import type { DetailWindowShellProps } from "@ai-matrx/detail/react";
import { resolvedListContextMax } from "../listContextCap";

/** What the address this window's token joins already costs (NEW-19). */
function currentAddressCost(): number | undefined {
  if (typeof window === "undefined") return undefined;
  return panelUrlReserveBytes(`${window.location.pathname}${window.location.search}`);
}

export function DetailWindowShell({
  instanceKey,
  list,
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
      /* 🚨 NEW-15 — the token carries the LIST too, under the same cap and byte
         budget the page URL obeys, so a refresh keeps the previous / next
         controls and the counter instead of losing them in silence.
         🚨 NEW-19 — and the budget is measured on the FINAL address: this token
         is merged into the query the person is already on (a detail PAGE carries
         its own capped list), so what that address costs after re-serialization
         is RESERVED. Without it, a window opened from a detail page produced a
         13,433-character URL the edge refuses. */
      urlSyncArgs={{
        [DETAIL_URL_AS_ARG]: "window",
        ...detailListToUrlArgs(list, resolvedListContextMax(), {
          reservedBytes: currentAddressCost(),
        }),
      }}
    >
      {children}
    </WindowPanel>
  );
}
