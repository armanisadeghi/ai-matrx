"use client";

/**
 * The "waiting on you" runs as a window — the same list as `/workflows/waiting`.
 *
 * It WRAPS the canonical component (`../components/WaitingInbox`), which never
 * answers anything itself: each row opens its run — in a NEW TAB here, because a
 * window over a page never moves that page.
 * Opened from the bell's All places strip (notifications ruling 3).
 *
 * Rendered only behind the lazy overlay boundary (`OverlayController`).
 */

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { WaitingInbox } from "../components/WaitingInbox";

export function WaitingRunsWindow({ onClose }: { onClose?: () => void }) {
  return (
    <WindowPanel
      id="waiting-runs-window"
      overlayId="waitingRunsWindow"
      title="Workflows waiting on you"
      width={560}
      height={520}
      minWidth={340}
      minHeight={260}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <WaitingInbox openRunsInNewTab />
      </div>
    </WindowPanel>
  );
}

export default WaitingRunsWindow;
