// features/window-panels/detail/shells/DetailWindowShell.tsx
//
// The WINDOW shell for the Detail primitive: `WindowPanel`, this app's window
// manager — tray docking, workspace persistence, shared z-order, mobile
// routing (`mobilePresentation: "drawer"` from the registry metadata), and the
// `?panels=detail:<type>.<id>:as-window` deep link through `urlSync`. The lib
// fills the slots; nothing about the record is decided here.
//
// 🚨 NEW-22 — ESCAPE CLOSES, INCLUDING FROM THE WINDOW'S OWN CHROME (the close,
// minimize and pop-out buttons and the drag handle, which render in `WindowPanel`'s
// portal outside every slot the primitive binds, and which `WindowPanel` itself
// answers no keystroke on). `useShellChromeEscape` is what makes the keyboard model
// the package specifies true there too (VERIFY-U-P1-R5, NEW-22).
//
// PARSES `WindowPanel` — lazy only. Reached through the `detailWindow`
// overlay's `lazyOverlay` entry (`windows/detail/DetailWindow.tsx`), never
// from a route or a boot module.

"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import type { DetailWindowShellProps } from "@/lib/detail/host";
import {
  DETAIL_URL_AS_ARG,
  DETAIL_URL_TYPE_KEY,
  detailListToUrlArgs,
  panelUrlReserveBytes,
} from "@/lib/detail/presentation";
import { resolvedListContextMax } from "../listContextCap";
import { useShellChromeEscape } from "./useShellChromeEscape";

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
  useShellChromeEscape(onClose);
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
