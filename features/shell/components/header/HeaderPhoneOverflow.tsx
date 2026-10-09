"use client";

/**
 * HeaderPhoneOverflow — THE HEADER RIGHT SET, folded into one control on a phone.
 *
 * 🚨 WHY (page-pass shared defects, 2026-09-27). At 375px the right set
 * (Search, Agents, Canvas, Inbox — 44px each) plus the route's own actions and
 * the "Choose org" chip took ~260px of the header, and the page's title in the
 * center collapsed to "C.", "Fla…", "O…", "Fa…". The title is the one thing
 * the header exists to show. Below 768px (`useIsMobile`) the four controls fold into
 * this ONE button, which opens a bottom sheet holding all four — the same
 * controls, the same states, the same auth gates:
 *
 *   Search        → the ⌘K bar (the dock's Search door, too)
 *   Intelligence  → the page's agents panel, in this sheet
 *   Canvas        → open / put away; empty opens the canvas home
 *   Messages      → the Messages canvas tab; its unread count on the row
 *   Notifications → the Notifications canvas tab (notifications ruling 4: it
 *                   opens windows or new tabs only, never moves the page)
 *
 * The owner's header ruling (2026-09-19: "a consistent set … never hiding
 * things and only disabling when inactive") still holds per device: a phone
 * ALWAYS shows this one button, never a set that changes with state, and
 * nothing it holds is removed. Desktop is unchanged. The swap is CSS
 * (`.shell-header-secondary` / `.shell-header-overflow`, `styles/shell.css`)
 * so the server-rendered header never shifts on hydrate.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Layers,
  MessageSquare,
  Search,
} from "lucide-react";
import { TapTargetButtonTransparent } from "@ai-matrx/design-system/tap-target";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";
import { useOpenBarOrGate } from "@/features/knowledge/command-bar/OpenCommandBarButtons";
import {
  AGENTS_AUTH_GATE,
  SurfaceAgentsPanelImpl,
} from "@ai-matrx/chat/surfaces/components/chrome/SurfaceAgentsHeaderButton";
import { useCanvasHeaderToggle } from "@/features/canvas/core/CanvasHeaderToggle";
import { INBOX_AUTH_GATE } from "@/features/notifications/components/InboxHeaderButton";
import {
  MESSAGES_AUTH_GATE,
  useUnreadConversationCount,
} from "@/features/messaging/components/shell/MessagesHeaderButton";
import { useMessagesToggle } from "@/features/messaging/canvas/messagesKind";
import { useNotificationsToggle } from "@/features/notifications/canvas/notificationsKind";
import { useInboxCounts } from "@/features/notifications/useInbox";
import { cn } from "@/lib/utils";
import {
  pushPhonePageActionsHost,
  usePhonePageActions,
} from "./phone-page-actions";

type View = "menu" | "agents";

function Row({
  icon,
  label,
  detail,
  onClick,
  disabled,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  detail?: string;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground"
          : "text-foreground hover:bg-accent active:bg-accent",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base">{label}</span>
        {detail ? (
          <span className="type-secondary text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      {trailing}
    </button>
  );
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 type-secondary font-semibold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

const TRIGGER_LABEL = "Search, intelligence, canvas, messages and notifications";

/**
 * 🚨 THE UNREAD MARK NEVER SITS ON THE ⋮ (page-pass shared defects,
 * 2026-09-27). A "99+" pill in the 44px button's corner covered the glyph on
 * a phone. The trigger now carries a small DOT in the button's own corner,
 * clear of the icon (the glyph is ~20px centred; the dot sits in the outer
 * 8px ring), the number is in the button's accessible name, and the sheet's
 * Inbox row shows the full count.
 */
function OverflowTrigger({ onOpen, unread }: { onOpen: () => void; unread: number }) {
  const label =
    unread > 0 ? `${TRIGGER_LABEL} — ${unread > 99 ? "99+" : unread} new` : TRIGGER_LABEL;
  return (
    <>
      <TapTargetButtonTransparent icon={<EllipsisVertical />} ariaLabel={label} onClick={onOpen} />
      {unread > 0 ? (
        <span
          className="pointer-events-none absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background"
          data-header-overflow-unread
          aria-hidden
        />
      ) : null}
    </>
  );
}

function SignedInOverflowTrigger({ onOpen }: { onOpen: () => void }) {
  const counts = useInboxCounts();
  const messages = useUnreadConversationCount();
  return <OverflowTrigger onOpen={onOpen} unread={counts.badge + messages} />;
}

function MessagesRowTrailing() {
  return <CountBadge count={useUnreadConversationCount()} />;
}

function InboxRowTrailing() {
  const counts = useInboxCounts();
  return <CountBadge count={counts.badge} />;
}

/**
 * The page's own header actions, at the top of the sheet. The host node (which
 * `RouteHeader` portals its actions into) is MOVED in while the section shows
 * and back to the hidden holder when it goes — the actions never unmount.
 * A press on an action closes the sheet, unless it opens a menu of its own.
 */
function PageActionsSection({
  host,
  holder,
  onDone,
}: {
  host: HTMLElement;
  holder: HTMLElement | null;
  onDone: () => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [anyDrawn, setAnyDrawn] = useState(true);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    slot.appendChild(host);
    // 🚨 NO 0×0 PIECES (page-pass shared defects, 2026-09-27). A control a
    // page draws only on wider screens (`hidden sm:flex`) is 0×0 here — it has
    // a phone twin — so its row is hidden instead of leaving an empty band
    // with a stray label; the section itself goes when nothing in it draws.
    const prune = () => {
      let drawn = 0;
      host.querySelectorAll<HTMLElement>("[data-route-header-overflow-item]").forEach((item) => {
        const pieces = [...item.children].filter((c) => !c.hasAttribute("data-phone-sheet-label"));
        const visible = pieces.some((c) => {
          const r = c.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        item.style.display = visible ? "" : "none";
        if (visible) drawn += 1;
      });
      host.querySelectorAll<HTMLElement>("[data-page-header-right-phone]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) drawn += 1;
      });
      setAnyDrawn(drawn > 0);
    };
    prune();
    const observer = new MutationObserver(() => requestAnimationFrame(prune));
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style"] });
    return () => {
      observer.disconnect();
      if (holder) holder.appendChild(host);
    };
  }, [host, holder]);
  return (
    <section
      aria-label="This page"
      data-header-page-actions
      className="border-b border-border pb-1"
      style={anyDrawn ? undefined : { display: "none" }}
    >
      <p className="px-3 pb-1 pt-1 type-secondary font-medium text-muted-foreground">This page</p>
      {/* 🚨 A PAGE ROW LOOKS LIKE A SHELL ROW (page-pass 2026-09-28). A page's
          header actions arrive as desktop-sized buttons (14px text, 14px
          icons, medium weight) and sat above the shell's 16px/20px rows in
          the same sheet. The contract restyles them here, once, for every
          page: 48px rows, 16px regular text, 20px icons, 12px icon gap, the
          icon column aligned with Search / Agents / Inbox below. */}
      <div
        ref={slotRef}
        className={cn(
          "[&_[data-route-header-overflow-item]]:min-h-12 [&_[data-route-header-overflow-item]]:px-2",
          "[&_[data-route-header-overflow-item]_span]:text-base [&_[data-route-header-overflow-item]_span]:text-foreground",
          // Action rows only — the folded section nav keeps its own styling.
          "[&_[data-route-header-overflow-item]:not([data-route-header-phone-nav])]:px-0",
          "[&_[data-route-header-overflow-item]:not([data-route-header-phone-nav])>button]:h-auto [&_[data-route-header-overflow-item]:not([data-route-header-phone-nav])>button]:min-h-12 [&_[data-route-header-overflow-item]:not([data-route-header-phone-nav])>button]:gap-3 [&_[data-route-header-overflow-item]:not([data-route-header-phone-nav])>button]:text-base [&_[data-route-header-overflow-item]:not([data-route-header-phone-nav])>button]:font-normal",
          "[&_[data-route-header-overflow-item]:not([data-route-header-phone-nav])_svg]:size-5 [&_[data-route-header-overflow-item]:not([data-route-header-phone-nav])_svg]:mr-0",
        )}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[aria-haspopup]")) return;
          if (target.closest("button, a, [role='button'], [role='menuitem']")) onDone();
        }}
      />
    </section>
  );
}

export function HeaderPhoneOverflow({
  isAuthenticated,
}: {
  isAuthenticated: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const openSearch = useOpenBarOrGate(isAuthenticated);
  const openAuthGate = useOpenAuthGateDialog();
  const canvas = useCanvasHeaderToggle();
  const messages = useMessagesToggle();
  const notifications = useNotificationsToggle();
  const pageActions = usePhonePageActions();

  // The persistent node route headers portal their actions into (see
  // `phone-page-actions.ts`); it rests in a hidden holder beside the button.
  const [holder, setHolder] = useState<HTMLDivElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!holder) return;
    const node = document.createElement("div");
    node.setAttribute("data-header-page-actions-host", "");
    holder.appendChild(node);
    setHost(node);
    const release = pushPhonePageActionsHost(node);
    return () => {
      release();
      node.remove();
    };
  }, [holder]);

  const close = () => setOpen(false);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setView("menu");
  };

  const canvasState =
    canvas.itemCount === 0 ? "empty" : canvas.isOpen ? "open" : "closed";

  const title = view === "agents" ? "Intelligence" : "More";

  return (
    <div className="shell-header-overflow relative shrink-0" data-header-phone-overflow>
      <div ref={setHolder} hidden aria-hidden />
      {isAuthenticated ? (
        <SignedInOverflowTrigger onOpen={() => setOpen(true)} />
      ) : (
        <OverflowTrigger onOpen={() => setOpen(true)} unread={0} />
      )}
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-textured pb-safe max-h-[85dvh]">
          <DrawerHeader className={view === "menu" ? "sr-only" : "flex flex-row items-center gap-1 px-2 py-1 text-left"}>
            {view !== "menu" ? (
              <TapTargetButtonTransparent
                icon={<ChevronLeft />}
                ariaLabel="Back"
                onClick={() => setView("menu")}
              />
            ) : null}
            <DrawerTitle className="text-base">{title}</DrawerTitle>
          </DrawerHeader>

          {view === "menu" ? (
            <div className="matrx-touch-targets flex flex-col gap-0.5 px-2 pb-4">
              {host && pageActions.count > 0 ? (
                <PageActionsSection host={host} holder={holder} onDone={close} />
              ) : null}
              <Row
                icon={<Search className="h-5 w-5" />}
                label="Search"
                onClick={() => {
                  close();
                  openSearch();
                }}
              />
              <Row
                icon={<INTELLIGENCE_ICON className="h-5 w-5 text-primary" />}
                label="Intelligence"
                onClick={() => {
                  if (!isAuthenticated) {
                    close();
                    openAuthGate(AGENTS_AUTH_GATE);
                    return;
                  }
                  setView("agents");
                }}
                trailing={<ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />}
              />
              {/* Same reservation as the desktop slot: present until a surface
                  REPORTS the canvas unavailable, never missing while the
                  deferred front door is still mounting. */}
              <Row
                icon={<MessageSquare className="h-5 w-5" />}
                label="Messages"
                onClick={() => {
                  close();
                  if (!isAuthenticated) {
                    openAuthGate(MESSAGES_AUTH_GATE);
                    return;
                  }
                  messages.toggle();
                }}
                trailing={isAuthenticated ? <MessagesRowTrailing /> : undefined}
              />
              <Row
                icon={<Bell className="h-5 w-5" />}
                label="Notifications"
                onClick={() => {
                  close();
                  if (!isAuthenticated) {
                    openAuthGate(INBOX_AUTH_GATE);
                    return;
                  }
                  notifications.toggle();
                }}
                trailing={isAuthenticated ? <InboxRowTrailing /> : undefined}
              />
              {canvas.isAvailable || !canvas.availabilityKnown ? (
                <Row
                  icon={<Layers className="h-5 w-5" />}
                  label={
                    canvas.homeOnly
                      ? "Close canvas"
                      : canvasState === "open"
                      ? `Put away canvas — ${canvas.headlineTitle}`
                      : canvasState === "closed"
                        ? `Open canvas — ${canvas.headlineTitle}`
                        : "Canvas"
                  }
                  onClick={() => {
                    close();
                    if (canvas.isOpen) canvas.putAway();
                    else canvas.reopen();
                  }}
                />
              ) : null}
            </div>
          ) : (
            <div className="overflow-y-auto px-1 pb-4">
              <SurfaceAgentsPanelImpl onRequestClose={close} />
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export default HeaderPhoneOverflow;
