"use client";

/**
 * The assists window — the same surface as `/assists`, in a WindowPanel.
 *
 * It WRAPS the canonical component (`../manager/AssistsManager`): every status,
 * the snoozed and silenced lists, and Turn back on — so an assist a person put
 * off is one click from the bell, over whatever page they are on (notifications
 * ruling 3, 2026-10-01). Never a second renderer.
 *
 * Rendered only behind the lazy overlay boundary (`OverlayController`).
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { AssistsManager } from "../manager/AssistsManager";

export function AssistsWindow({ onClose }: { onClose?: () => void }) {
  return (
    <WindowPanel
      id="assists-window"
      overlayId="assistsWindow"
      title="Assists"
      width={960}
      height={640}
      minWidth={380}
      minHeight={320}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-hidden">
        <AssistsManager />
      </div>
    </WindowPanel>
  );
}

export default AssistsWindow;
