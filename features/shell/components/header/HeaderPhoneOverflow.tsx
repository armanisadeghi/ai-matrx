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
 *   Search  → the ⌘K bar (the dock's Search door, too)
 *   Agents  → the page's agents panel, in this sheet
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

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  EllipsisVertical,
  Layers,
  Search,
} from "lucide-react";
import { TapTargetButton } from "@ai-matrx/tap-target";
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
} from "@/features/surfaces/components/chrome/SurfaceAgentsHeaderButton";
import {
  CANVAS_EMPTY_TOOLTIP,
  useCanvasHeaderToggle,
} from "@/features/canvas/core/CanvasHeaderToggle";
import { INBOX_AUTH_GATE } from "@/features/notifications/components/InboxHeaderButton";
import { InboxPanel } from "@/features/notifications/components/InboxPanel";
import { useInboxCounts } from "@/features/notifications/useInbox";
import { cn } from "@/lib/utils";
import {
  setPhonePageActionsHost,
  usePhonePageActions,
} from "./phone-page-actions";

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

const TRIGGER_LABEL = "Search, agents, canvas and inbox";

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
    unread > 0 ? `${TRIGGER_LABEL} — ${unread > 99 ? "99+" : unread} new in the inbox` : TRIGGER_LABEL;
  return (
    <>
      <TapTargetButton icon={<EllipsisVertical />} ariaLabel={label} onClick={onOpen} />
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
  return <OverflowTrigger onOpen={onOpen} unread={counts.total} />;
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
      <p className="px-3 pb-1 pt-1 text-xs font-medium text-muted-foreground">This page</p>
      <div
        ref={slotRef}
        className="[&_[data-route-header-overflow-item]]:min-h-12 [&_[data-route-header-overflow-item]]:px-2 [&_[data-route-header-overflow-item]_span]:text-base [&_[data-route-header-overflow-item]_span]:text-foreground"
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
    setPhonePageActionsHost(node);
    return () => {
      setPhonePageActionsHost(null);
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

  const title =
    view === "agents" ? "Agents" : view === "inbox" ? "Inbox" : "More";

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
