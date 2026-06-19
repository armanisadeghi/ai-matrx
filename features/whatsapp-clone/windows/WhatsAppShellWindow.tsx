"use client";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { WhatsAppShellInner } from "../shell/WhatsAppShellInner";

const OVERLAY_ID = "whatsappShellWindow";
const WINDOW_ID = "whatsapp-shell";

interface WhatsAppShellWindowProps {
  isOpen?: boolean;
  onClose?: () => void;
  userName?: string;
  userAvatarUrl?: string | null;
}

/**
 * The entire WhatsApp app rendered as a single floating WindowPanel.
 * The WindowPanel chrome (traffic-light controls, drag region, resize handles,
 * minimize/maximize) replaces the custom title bar from the modal-style demo.
 */
export function WhatsAppShellWindow({
  isOpen = true,
  onClose,
  userName,
  userAvatarUrl,
}: WhatsAppShellWindowProps) {
  if (!isOpen) return null;

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      title="WhatsApp"
      titleNode={
        <span className="text-[14px] font-medium text-foreground">
          AI Matrx Messenger
        </span>
      }
      width={1200}
      height={720}
      minWidth={1080}
      minHeight={680}
      position="center"
      bodyClassName="p-0"
      onClose={onClose}
    >
      <WhatsAppShellInner userName={userName} userAvatarUrl={userAvatarUrl} />
    </WindowPanel>
  );
}

export default WhatsAppShellWindow;
