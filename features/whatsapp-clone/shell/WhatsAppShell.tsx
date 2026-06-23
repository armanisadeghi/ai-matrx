"use client";

import { TitleBar } from "./TitleBar";
import { WhatsAppShellInner } from "./WhatsAppShellInner";

interface WhatsAppShellProps {
  userName?: string;
  userAvatarUrl?: string | null;
}

/**
 * Standalone WhatsApp shell — used by the modal-style demo at
 * /demos/whatsapp-demo. Renders a custom traffic-light TitleBar above the
 * shell body. The windowed demo at /demos/whatsapp-window-demo wraps
 * WhatsAppShellInner in a WindowPanel instead, which provides its own chrome.
 *
 * Settings and Media open via the global overlay system — no internal modal
 * provider. The WhatsAppSettingsWindow and WhatsAppMediaWindow are registered
 * in the window-panels registry and rendered by UnifiedOverlayController.
 */
export function WhatsAppShell({ userName, userAvatarUrl }: WhatsAppShellProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card text-foreground">
      <TitleBar />
      <WhatsAppShellInner
        userName={userName}
        userAvatarUrl={userAvatarUrl}
      />
    </div>
  );
}
