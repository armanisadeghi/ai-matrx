"use client";

/**
 * MessagesHeaderButton — direct messages in the shell header, with their own
 * count (owner, 2026-09-30: Notifications no longer carries DMs).
 *
 * One of the fixed header controls (features/shell/FEATURE.md § THE HEADER
 * RIGHT SET). Always mounted, one 44px slot:
 *
 *   signed in  → message icon + unread-conversation badge; toggles the
 *                Messages canvas tab (`features/messaging/canvas`). Pressed
 *                while that tab is in front.
 *   signed out → the same icon; a click opens the auth gate naming Messages.
 *
 * The badge reads the ONE messaging store (`useConversations` from the
 * package), so it can never disagree with the tab's own list.
 */

import { MessageTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { useConversations } from "@ai-matrx/messaging/react";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";
import { useMessagesToggle } from "@/features/messaging/canvas/messagesKind";

/** What a guest is told when they reach for Messages — one copy for every door. */
export const MESSAGES_AUTH_GATE = {
  featureName: "Messages",
  featureDescription: "Direct conversations with the people you work with.",
};

/** Unread conversations — the Messages badge everywhere it is drawn. */
export function useUnreadConversationCount(): number {
  return useConversations().totalUnreadConversations;
}

function MessagesBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      className="pointer-events-none absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground"
      aria-hidden
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function GuestMessagesButton() {
  const openAuthGate = useOpenAuthGateDialog();
  return (
    <MessageTapButton
      variant="transparent"
      ariaLabel="Messages — sign in to message people"
      tooltip="Messages (sign in)"
      onClick={() => openAuthGate(MESSAGES_AUTH_GATE)}
    />
  );
}

function SignedInMessagesButton() {
  const unread = useUnreadConversationCount();
  const { isVisible, toggle } = useMessagesToggle();
  const label = unread > 0 ? `Messages (${unread} unread)` : "Messages";
  return (
    <div className="relative shrink-0" data-messages-header-button>
      <MessageTapButton
        variant="transparent"
        ariaLabel={label}
        tooltip={label}
        className={unread > 0 ? "text-primary" : undefined}
        pressed={isVisible}
        onClick={toggle}
      />
      <MessagesBadge count={unread} />
    </div>
  );
}

export function MessagesHeaderButton({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  return isAuthenticated ? <SignedInMessagesButton /> : <GuestMessagesButton />;
}

export default MessagesHeaderButton;
