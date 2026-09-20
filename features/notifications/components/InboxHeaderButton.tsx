"use client";

/**
 * features/notifications/components/InboxHeaderButton.tsx — the shell bell.
 *
 * One of the FOUR fixed header controls (see features/shell/FEATURE.md
 * § The header right set). Always mounted, always the same 44px slot:
 *
 *   signed in  → bell + badge (unread notices + conversations with unread +
 *                proposals waiting), opens the Inbox popover (desktop) or a
 *                bottom drawer (mobile).
 *   signed out → the same bell; a click opens the auth gate naming the
 *                Inbox. Never hidden, never a dead control.
 *
 * The badge reads the ONE inbox reader (`useInboxCounts`); a `partial` count
 * (one of its parts could not be read) shows the number it has and says so in
 * the label rather than printing a confident wrong total.
 *
 * Idle cost = one tap-target + three cheap hooks; the panel body only mounts
 * while open.
 */

import { useState } from "react";
import { BellRingTapButton, BellTapButton } from "@ai-matrx/tap-target/buttons";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";
import { useInboxCounts } from "../useInbox";
import { InboxPanel } from "./InboxPanel";

function InboxBadge({ count }: { count: number }) {
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

function GuestInboxButton() {
  const openAuthGate = useOpenAuthGateDialog();
  return (
    <BellTapButton
      ariaLabel="Inbox — sign in to see your notifications"
      tooltip="Inbox (sign in)"
      onClick={() =>
        openAuthGate({
          featureName: "Inbox",
          featureDescription:
            "Every notification, message and approval in one place, delivered the way you choose.",
        })
      }
    />
  );
}

function SignedInInboxButton() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const counts = useInboxCounts();

  const Bell = counts.total > 0 ? BellRingTapButton : BellTapButton;
  const label =
    counts.total > 0
      ? `Inbox (${counts.total} new${counts.partial ? ", some counts unavailable" : ""})`
      : counts.partial
        ? "Inbox (some counts unavailable)"
        : "Inbox";

  const trigger = (
    <div className="relative shrink-0" data-inbox-header-button>
      <Bell
        ariaLabel={label}
        tooltip={label}
        className={counts.total > 0 ? "text-primary" : undefined}
        onClick={isMobile ? () => setOpen(true) : undefined}
      />
      <InboxBadge count={counts.total} />
    </div>
  );

  if (isMobile) {
    return (
      <>
        {trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="bg-textured pb-safe max-h-[85dvh]">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Inbox</DrawerTitle>
            </DrawerHeader>
            {open && (
              <InboxPanel
                variant="compact"
                onNavigate={() => setOpen(false)}
                className="max-h-[80dvh]"
              />
            )}
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-[380px] max-w-[92vw] p-0 bg-textured"
      >
        {open && (
          <InboxPanel variant="compact" onNavigate={() => setOpen(false)} />
        )}
      </PopoverContent>
    </Popover>
  );
}

export function InboxHeaderButton({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  return isAuthenticated ? <SignedInInboxButton /> : <GuestInboxButton />;
}

export default InboxHeaderButton;
