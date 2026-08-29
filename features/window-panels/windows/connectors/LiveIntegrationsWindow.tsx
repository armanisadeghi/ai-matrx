"use client";

import { LiveIntegrationsList } from "@/features/connectors/LiveIntegrationsList";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

interface LiveIntegrationsWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LiveIntegrationsWindow({
  isOpen,
  onClose,
}: LiveIntegrationsWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id="live-integrations-window"
      overlayId="liveIntegrationsWindow"
      title="Integrations"
      width={720}
      height={640}
      minWidth={360}
      minHeight={360}
      position="center"
      onClose={onClose}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <LiveIntegrationsList />
    </WindowPanel>
  );
}
