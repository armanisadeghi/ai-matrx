"use client";

/**
 * The header's Chat control — one of THE HEADER RIGHT SET (features/shell/
 * FEATURE.md): always mounted in its 44px slot, pressed while the chat dock is
 * open, DISABLED with the reason on a page that has its own chat, and the auth
 * gate for a guest. Never unmounted on state, so the row never shifts.
 */

import { MessageTapButton } from "@ai-matrx/tap-target/buttons";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";
import { cn } from "@/lib/utils";
import { useChatDock } from "./useChatDock";

export const CHAT_DOCK_AUTH_GATE = {
  featureName: "Chat",
  featureDescription:
    "Chat beside any page — the chat sees the page you are on. Sign in to use it.",
};

export const CHAT_DOCK_TOOLTIP_CLOSED = "Chat beside this page";
export const CHAT_DOCK_TOOLTIP_OPEN = "Hide the chat";

const SLOT_BOX = {
  width: "var(--matrx-tap-target-size, 2.75rem)",
  height: "var(--matrx-tap-target-size, 2.75rem)",
} as const;

export function ChatDockHeaderButton({
  initialOpen,
  isAuthenticated,
}: {
  initialOpen: boolean;
  isAuthenticated: boolean;
}) {
  const dock = useChatDock(initialOpen);
  const openAuthGate = useOpenAuthGateDialog();
  const unavailable = dock.unavailableReason !== null;

  return (
    <div className="relative shrink-0" style={SLOT_BOX} data-chat-dock-header-slot>
      <MessageTapButton
        onClick={isAuthenticated ? dock.toggle : () => openAuthGate(CHAT_DOCK_AUTH_GATE)}
        disabled={isAuthenticated && unavailable}
        ariaLabel={
          !isAuthenticated
            ? "Chat — sign in to chat beside any page"
            : unavailable
              ? `Chat (${dock.unavailableReason})`
              : dock.pressed
                ? CHAT_DOCK_TOOLTIP_OPEN
                : CHAT_DOCK_TOOLTIP_CLOSED
        }
        tooltip={
          isAuthenticated && unavailable
            ? (dock.unavailableReason ?? undefined)
            : dock.pressed
              ? CHAT_DOCK_TOOLTIP_OPEN
              : CHAT_DOCK_TOOLTIP_CLOSED
        }
        className={cn(
          isAuthenticated && unavailable ? "text-muted-foreground" : "text-primary",
          dock.pressed && "bg-primary/10",
          !unavailable && "hover:bg-primary/10",
        )}
      />
    </div>
  );
}
