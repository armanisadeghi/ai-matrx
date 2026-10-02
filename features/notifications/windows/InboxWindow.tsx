"use client";

/**
 * The inbox as a window — the bell's "Open inbox" (owner ruling 4, 2026-10-01:
 * the bell never moves the page). It WRAPS the canonical `/notifications`
 * workspace (`../components/InboxWorkspace`); the organization filter lives in
 * the window's own state, because a window never writes the page's address.
 *
 * Rendered only behind the lazy overlay boundary (`OverlayController`).
 */

import { useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { InboxWorkspace, isInboxTab } from "../components/InboxWorkspace";

export function InboxWindow({
  onClose,
  initialTab,
}: {
  onClose?: () => void;
  initialTab?: string | null;
}) {
  const [orgFilter, setOrgFilter] = useState<string | null>(null);
  return (
    <WindowPanel
      id="notifications-inbox-window"
      overlayId="notificationsInboxWindow"
      title="Inbox"
      width={1080}
      height={680}
      minWidth={360}
      minHeight={320}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      onClose={onClose}
    >
      <InboxWorkspace
        // A second open asking for another view ("+ N more", "See Done") lands on it.
        key={isInboxTab(initialTab) ? initialTab : "inbox"}
        mode="window"
        initialTab={isInboxTab(initialTab) ? initialTab : "inbox"}
        orgFilter={orgFilter}
        onOrgFilterChange={setOrgFilter}
      />
    </WindowPanel>
  );
}

export default InboxWindow;
