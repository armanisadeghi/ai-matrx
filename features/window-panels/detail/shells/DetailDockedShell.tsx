// features/window-panels/detail/shells/DetailDockedShell.tsx
//
// The DOCKED shell for the Detail primitive: `SidePanelSurface`, the app's
// existing docked side panel — `MatrxDynamicPanelHost` on react-resizable-
// panels v4 on desktop (drag-resize, no backdrop, Escape closes), a bottom
// Drawer on phones. Registers the `?panels=detail:<type>.<id>:as-docked`
// deep link while mounted. The lib fills the slots.

"use client";

import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
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
