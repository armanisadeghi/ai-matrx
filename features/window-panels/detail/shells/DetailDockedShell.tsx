// features/window-panels/detail/shells/DetailDockedShell.tsx
//
// The DOCKED shell for the Detail primitive: `SidePanelSurface`, the app's
// existing docked side panel — `MatrxDynamicPanelHost` on react-resizable-
// panels v4 on desktop (drag-resize, no backdrop), a bottom Drawer on phones.
// Registers the `?panels=detail:<type>.<id>:as-docked` deep link while mounted.
// The lib fills the slots.
//
// 🚨 NEW-22 — ESCAPE CLOSES, INCLUDING FROM THIS SHELL'S OWN CHROME. It is
// `useShellChromeEscape` that makes that true: `SidePanelSurface` contains no
// keystroke handling of any kind, and this comment used to claim "Escape closes"
// as if the surface did it (VERIFY-U-P1-R5, NEW-22).

"use client";

import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { useShellChromeEscape } from "./useShellChromeEscape";
import { useUrlSync } from "@/features/window-panels/url-sync/useUrlSync";
import type { DetailDockedShellProps } from "@/lib/detail/host";
import { DETAIL_URL_AS_ARG, DETAIL_URL_TYPE_KEY } from "@/lib/detail/presentation";

export function DetailDockedShell({
  instanceKey,
  title,
  titleNode,
  actions,
  onClose,
  children,
}: DetailDockedShellProps) {
  useUrlSync(DETAIL_URL_TYPE_KEY, instanceKey, { [DETAIL_URL_AS_ARG]: "docked" });
  useShellChromeEscape(onClose);
  return (
    <SidePanelSurface
      title={title}
      titleNode={titleNode}
      onClose={onClose}
      headerActions={actions}
      defaultWidth={540}
      minWidth={380}
      maxWidth={960}
      storageKey="detail-docked"
    >
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">{children}</div>
    </SidePanelSurface>
  );
}
