"use client";

/**
 * The approvals window — the same surface as `/approvals`, in a WindowPanel.
 *
 * It WRAPS the canonical component (`../ApprovalsWorkspace`), which is the only
 * body: a bespoke panel body would be a second renderer that drifts from the
 * page and usually truncates (`features/window-panels/FEATURE.md` § A PANEL
 * WRAPS THE CANONICAL COMPONENT). Header/footer would be slots if it needed
 * any; it needs none, because the workspace carries its own heading row.
 *
 * Rendered ONLY behind the lazy overlay boundary
 * (`features/overlays/OverlayController.tsx` → `lazyOverlay`) — never
 * static-imported from a route, layout or provider (the bundle invariant).
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ApprovalsWorkspace } from "../ApprovalsWorkspace";

export function ApprovalsWindow({
  id = "approvals-window",
  onClose,
}: {
  id?: string;
  onClose?: () => void;
}) {
  return (
    <WindowPanel
      id={id}
      overlayId="approvalsWindow"
      title="Waiting on you"
      width={720}
      height={560}
      minWidth={360}
      minHeight={280}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <ApprovalsWorkspace />
      </div>
    </WindowPanel>
  );
}

export default ApprovalsWindow;
