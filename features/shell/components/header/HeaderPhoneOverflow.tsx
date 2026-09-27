"use client";

/**
 * HeaderPhoneOverflow — THE HEADER RIGHT SET, folded into one control on a phone.
 *
 * 🚨 WHY (page-pass shared defects, 2026-09-27). At 375px the right set
 * (Search, Agents, Canvas, Inbox — 44px each) plus the route's own actions and
 * the "Choose org" chip took ~260px of the header, and the page's title in the
 * center collapsed to "C.", "Fla…", "O…", "Fa…". The title is the one thing
 * the header exists to show. Below `sm` (640px) the four controls fold into
 * this ONE button, which opens a bottom sheet holding all four — the same
 * controls, the same states, the same auth gates:
 *
 *   Search  → the ⌘K bar (the dock's Search door, too)
 *   Agents  → the page's agents panel, in this sheet
 *   Chat    → the chat beside this page (its own bottom sheet); a page that is
 *             its own chat = disabled row that says why
 *   Canvas  → open / put away; empty = disabled row that says why
 *   Inbox   → the inbox panel, in this sheet; the unread count rides the button
 *
 * The owner's header ruling (2026-09-19: "a consistent set … never hiding
 * things and only disabling when inactive") still holds per device: a phone
 * ALWAYS shows this one button, never a set that changes with state, and
 * nothing it holds is removed. Desktop is unchanged. The swap is CSS
 * (`.shell-header-secondary` / `.shell-header-overflow`, `styles/shell.css`)
 * so the server-rendered header never shifts on hydrate.
 */

import { useState, type ReactNode } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Layers,
  MessageSquare,
  Search,
} from "lucide-react";
import { TapTargetButton } from "@ai-matrx/tap-target";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";
import { useOpenBarOrGate } from "@/features/knowledge/command-bar/OpenCommandBarButtons";
import {
  AGENTS_AUTH_GATE,
  SurfaceAgentsPanelImpl,
} from "@/features/surfaces/components/chrome/SurfaceAgentsHeaderButton";
import {
  CANVAS_EMPTY_TOOLTIP,
  useCanvasHeaderToggle,
} from "@/features/canvas/core/CanvasHeaderToggle";
import { INBOX_AUTH_GATE } from "@/features/notifications/components/InboxHeaderButton";
import { InboxPanel } from "@/features/notifications/components/InboxPanel";
import { useInboxCounts } from "@/features/notifications/useInbox";
import { cn } from "@/lib/utils";
import { CHAT_DOCK_AUTH_GATE, CHAT_DOCK_TOOLTIP_CLOSED } from "@/features/shell/chat-dock/ChatDockHeaderButton";
import { useChatDock } from "@/features/shell/chat-dock/useChatDock";

type View = "menu" | "agents" | "inbox";

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
          <span className="text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      {trailing}
    </button>
  );
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold leading-none text-primary-foreground">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** The inbox total for the trigger badge — signed in only (a guest has none). */
function SignedInTriggerBadge() {
  const counts = useInboxCounts();
  if (counts.total <= 0) return null;
  return (
    <span
      className="pointer-events-none absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground"
      aria-hidden
    >
      {counts.total > 99 ? "99+" : counts.total}
    </span>
  );
}

function InboxRowTrailing() {
  const counts = useInboxCounts();
  return (
    <>
      <CountBadge count={counts.total} />
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </>
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
  // On a phone the dock is always a sheet; its remembered desktop state is irrelevant here.
  const chatDock = useChatDock(false);

  const close = () => setOpen(false);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setView("menu");
  };

  const canvasState =
    canvas.itemCount === 0 ? "empty" : canvas.isOpen ? "open" : "closed";

  const title =
    view === "agents" ? "Agents" : view === "inbox" ? "Inbox" : "More";

  return (
    <div className="shell-header-overflow relative shrink-0" data-header-phone-overflow>
      <TapTargetButton
        icon={<EllipsisVertical />}
        ariaLabel="Search, agents, chat, canvas and inbox"
        onClick={() => setOpen(true)}
      />
      {isAuthenticated ? <SignedInTriggerBadge /> : null}
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-textured pb-safe max-h-[85dvh]">
          <DrawerHeader className={view === "menu" ? "sr-only" : "flex flex-row items-center gap-1 px-2 py-1 text-left"}>
            {view !== "menu" ? (
              <TapTargetButton
                icon={<ChevronLeft />}
                ariaLabel="Back"
                onClick={() => setView("menu")}
              />
            ) : null}
            <DrawerTitle className="text-base">{title}</DrawerTitle>
          </DrawerHeader>

          {view === "menu" ? (
            <div className="matrx-touch-targets flex flex-col gap-0.5 px-2 pb-4">
              <Row
                icon={<Search className="h-5 w-5" />}
                label="Search"
                onClick={() => {
                  close();
                  openSearch();
                }}
              />
              <Row
                icon={<AGENT_ICON className="h-5 w-5 text-primary" />}
                label="Agents for this page"
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
              <Row
                icon={<MessageSquare className="h-5 w-5 text-primary" />}
                label={CHAT_DOCK_TOOLTIP_CLOSED}
                detail={isAuthenticated ? (chatDock.unavailableReason ?? undefined) : undefined}
                disabled={isAuthenticated && chatDock.unavailableReason !== null}
                onClick={() => {
                  close();
                  if (!isAuthenticated) {
                    openAuthGate(CHAT_DOCK_AUTH_GATE);
                    return;
                  }
                  chatDock.toggle();
                }}
              />
              {canvas.isAvailable ? (
                <Row
                  icon={<Layers className="h-5 w-5" />}
                  label={
                    canvasState === "open"
                      ? `Put away canvas — ${canvas.headlineTitle}`
                      : canvasState === "closed"
                        ? `Open canvas — ${canvas.headlineTitle}`
                        : "Canvas"
                  }
                  detail={canvasState === "empty" ? CANVAS_EMPTY_TOOLTIP : undefined}
                  disabled={canvasState === "empty"}
                  onClick={() => {
                    close();
                    if (canvasState === "open") canvas.putAway();
                    else canvas.reopen();
                  }}
                />
              ) : null}
              <Row
                icon={<Bell className="h-5 w-5" />}
                label="Inbox"
                onClick={() => {
                  if (!isAuthenticated) {
                    close();
                    openAuthGate(INBOX_AUTH_GATE);
                    return;
                  }
                  setView("inbox");
                }}
                trailing={isAuthenticated ? <InboxRowTrailing /> : undefined}
              />
            </div>
          ) : view === "agents" ? (
            <div className="overflow-y-auto px-1 pb-4">
              <SurfaceAgentsPanelImpl onRequestClose={close} />
            </div>
          ) : (
            <InboxPanel
              variant="compact"
              onNavigate={close}
              className="max-h-[75dvh]"
            />
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
}

export default HeaderPhoneOverflow;
