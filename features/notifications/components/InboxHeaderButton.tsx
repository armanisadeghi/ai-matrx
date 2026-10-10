"use client";

/**
 * features/notifications/components/InboxHeaderButton.tsx — the shell bell.
 *
 * One of the fixed header controls (features/shell/FEATURE.md § The header right
 * set). Always mounted, always the same 44px slot:
 *
 *   signed in  → bell + badge; toggles the Notifications canvas tab (`BellPanel`
 *                in a pane below what the canvas shows). Pressed while in front.
 *   signed out → the same bell; a click opens the auth gate. Never hidden.
 *
 * THE BADGE (owner ruling 1, 2026-10-01) counts only what is NEW and needs you or
 * is addressed to you, and clears when the bell opens. Updates you only watch add
 * a dot, never a number. A part that could not be read shows a neutral dot and
 * says so in the label — never a confident wrong sum.
 *
 * `G` then `N` anywhere (outside a text field) opens the inbox window.
 */

import { useEffect, useRef } from "react";
import { BellRingTapButton, BellTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";
import { useInboxCounts } from "../useInbox";
import { useNotificationsToggle } from "../canvas/notificationsKind";

function InboxBadge({ count, dot }: { count: number; dot: "updates" | "unknown" | null }) {
  if (count > 0) {
    return (
      <span
        // Two-digit counts and "99+" share one width (27px): the count grows 12 -> 99+ as the inbox
        // reads land, and a pill that widened with it shifted by 6px each time (CLS).
        className={`pointer-events-none absolute right-1 top-1 flex h-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground ${count > 9 ? "min-w-[27px]" : "min-w-4"}`}
        aria-hidden
      >
        {count > 99 ? "99+" : count}
      </span>
    );
  }
  if (!dot) return null;
  return (
    <span
      className={
        dot === "updates"
          ? "pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-primary"
          : "pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-muted-foreground"
      }
      aria-hidden
    />
  );
}

/** What a guest is told when they reach for the Inbox — one copy for every door. */
export const INBOX_AUTH_GATE = {
  featureName: "Notifications",
  featureDescription:
    "Every notification and approval in one place, delivered the way you choose.",
};

function GuestInboxButton() {
  const openAuthGate = useOpenAuthGateDialog();
  return (
    <BellTapButton
      variant="transparent"
      ariaLabel="Notifications — sign in to see them"
      tooltip="Notifications (sign in)"
      onClick={() => openAuthGate(INBOX_AUTH_GATE)}
    />
  );
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/** `G` then `N` — go to the inbox from anywhere (GitHub, Atlassian). */
function useGoToInboxShortcut() {
  const dispatch = useAppDispatch();
  const pendingG = useRef(0);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "g") {
        pendingG.current = Date.now();
        return;
      }
      if (key === "n" && Date.now() - pendingG.current < 1200) {
        pendingG.current = 0;
        dispatch(openOverlay({ overlayId: "notificationsInboxWindow" }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);
}

function SignedInInboxButton() {
  const counts = useInboxCounts();
  const { isVisible, toggle } = useNotificationsToggle();
  useGoToInboxShortcut();

  const dot = counts.updatesDot ? "updates" : counts.partial ? "unknown" : null;
  const label =
    counts.badge > 0
      ? `Notifications, ${counts.badge} new${counts.partial ? " (some counts unavailable)" : ""}`
      : counts.updatesDot
        ? "Notifications, new updates"
        : counts.partial
          ? "Notifications (some counts unavailable)"
          : "Notifications";

  const Bell = counts.badge > 0 ? BellRingTapButton : BellTapButton;
  return (
    <div className="relative shrink-0" data-inbox-header-button>
      <Bell
        variant="transparent"
        ariaLabel={label}
        tooltip={label}
        className={counts.badge > 0 ? "text-primary" : undefined}
        pressed={isVisible}
        onClick={toggle}
      />
      <InboxBadge count={counts.badge} dot={dot} />
    </div>
  );
}

export function InboxHeaderButton({ isAuthenticated }: { isAuthenticated: boolean }) {
  return isAuthenticated ? <SignedInInboxButton /> : <GuestInboxButton />;
}

export default InboxHeaderButton;
