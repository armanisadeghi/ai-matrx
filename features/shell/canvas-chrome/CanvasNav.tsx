"use client";

/**
 * CanvasNav — the left nav of a chat-beside-a-canvas page (Amendment 1, A5).
 *
 * Three states, one DOM:
 *   - `collapsed` — nothing here; a single panel icon (<CanvasNavToggle/>)
 *     sits at the top-left of the chat header (or the canvas header when the
 *     chat is floating).
 *   - `hover`     — hovering that icon slides the FULL nav over the page as a
 *     full-height overlay. Never a short menu.
 *   - `open`      — clicking it puts the nav into the layout (240px); the
 *     icon moves into the nav's own header and closes it.
 *
 * It does NOT reuse the shell's `NavItem` / `.shell-nav-*` DOM (that styling
 * hangs off `.shell-root` + `#shell-sidebar-toggle`); it renders its own rows
 * with semantic tokens and sources every DESTINATION from existing code:
 * `primaryNavItems` (icons, the More flyout), the preferences window tile
 * (Customize), and the canonical `ConversationHistorySidebar` for search,
 * Pinned and dated history — opened IN PLACE through `onOpenConversation`.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ellipsis, PanelLeft, Plus, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import AppLink from "@/components/navigation/AppLink";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import {
  navItemsForViewer,
  primaryNavItems,
  type ShellNavItem,
} from "@/features/shell/constants/nav-data";
import { shellIconComponents, type ShellIconName } from "@/features/shell/shellIconMap";
import { useNavPanelActions } from "@/features/shell/navigation/navPanelActions";
import { CanvasUserRow } from "./CanvasUserRow";
import {
  writeCanvasNavCookie,
  type CanvasNavPersisted,
  type CanvasNavState,
} from "./canvas-nav-cookie";

export const CANVAS_NAV_WIDTH_PX = 240;

/** How long the pointer may be away from icon + overlay before the overlay closes. */
const HOVER_CLOSE_DELAY_MS = 160;

/** True while a popper (org drop-up, More flyout, a row menu) is open — it owns the pointer. */
function aPopperIsOpen(): boolean {
  return document.querySelector("[data-radix-popper-content-wrapper]") !== null;
}

// ── State ───────────────────────────────────────────────────────────────────

export interface CanvasNavController {
  state: CanvasNavState;
  open: () => void;
  collapse: () => void;
  /** Pointer entered the toggle or the overlay. */
  hoverEnter: () => void;
  /** Pointer left the toggle or the overlay. */
  hoverLeave: () => void;
}

export function useCanvasNavState(initial: CanvasNavPersisted): CanvasNavController {
  const [state, setState] = useState<CanvasNavState>(initial);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => () => cancelClose(), []);

  return {
    state,
    open: () => {
      cancelClose();
      setState("open");
      writeCanvasNavCookie("open");
    },
    collapse: () => {
      cancelClose();
      setState("collapsed");
      writeCanvasNavCookie("collapsed");
    },
    hoverEnter: () => {
      cancelClose();
      setState((current) => (current === "collapsed" ? "hover" : current));
    },
    hoverLeave: () => {
      cancelClose();
      closeTimer.current = window.setTimeout(() => {
        if (aPopperIsOpen()) return;
        setState((current) => (current === "hover" ? "collapsed" : current));
      }, HOVER_CLOSE_DELAY_MS);
    },
  };
}

// ── The icon ────────────────────────────────────────────────────────────────

/** The single panel icon: hover previews the nav, click puts it in the layout. */
export function CanvasNavToggle({ nav, className }: { nav: CanvasNavController; className?: string }) {
  return (
    <button
      type="button"
      aria-label="Show sidebar"
      title="Show sidebar"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") nav.hoverEnter();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") nav.hoverLeave();
      }}
      onClick={nav.open}
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
        nav.state === "hover" && "bg-accent text-foreground",
        className,
      )}
    >
      <PanelLeft className="h-4 w-4" />
    </button>
  );
}

// ── The nav ─────────────────────────────────────────────────────────────────

interface CanvasNavProps {
  nav: CanvasNavController;
  /** Conversation-history scope (shared state across mounts with the same id). */
  historyScopeId: string;
  activeConversationId: string | null;
  /** A history row was clicked — load it in the host's chat panel. */
  onOpenConversation: (conversation: ConversationListItem) => void;
  /** The header "+" — start a fresh chat in the host's panel. */
  onNewChat: () => void;
  /** Mobile: render as a plain full-height column inside a sheet. */
  variant?: "layout" | "sheet";
  className?: string;
}

interface CanvasNavRow {
  label: string;
  href: string;
}

/** The four destination rows (Customize and More are actions, below). */
const DESTINATIONS: readonly CanvasNavRow[] = [
  { label: "New", href: "/chat/new" },
  { label: "Projects", href: "/projects" },
  { label: "Artifacts", href: "/artifacts" },
  { label: "Scheduled", href: "/schedules" },
];

/** The icon the app nav already gives this destination — never a second choice. */
function navIconFor(href: string): LucideIcon {
  for (const item of primaryNavItems) {
    const child = item.children?.find((c) => c.href === href);
    const name: ShellIconName | undefined = child?.iconName ?? (item.href === href ? item.iconName : undefined);
    if (name) return shellIconComponents[name];
  }
  return Plus;
}

const ROW_CLASS =
  "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent";

export function CanvasNav({
  nav,
  historyScopeId,
  activeConversationId,
  onOpenConversation,
  onNewChat,
  variant = "layout",
  className,
}: CanvasNavProps) {
  const panelActions = useNavPanelActions();
  const hover = nav.state === "hover";

  const header = (
    <div className="flex h-8 shrink-0 items-center gap-1.5 px-1">
      {variant === "layout" ? (
        <button
          type="button"
          aria-label="Hide sidebar"
          title="Hide sidebar"
          onClick={hover ? nav.open : nav.collapse}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-foreground"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">AI Matrx</span>
      <button
        type="button"
        aria-label="New chat in this panel"
        title="New chat in this panel"
        onClick={onNewChat}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );

  const rows = (
    <nav aria-label="App" className="flex shrink-0 flex-col gap-0.5 px-1 pb-1 pt-1.5">
      {DESTINATIONS.map((row) => {
        const Icon = navIconFor(row.href);
        return (
          <AppLink key={row.href} href={row.href} className={ROW_CLASS}>
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
          </AppLink>
        );
      })}
      <button type="button" className={ROW_CLASS} onClick={panelActions["open-preferences-panel"]}>
        <SlidersHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Customize</span>
      </button>
      <CanvasNavMore>
        <button type="button" className={ROW_CLASS}>
          <Ellipsis className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">More</span>
        </button>
      </CanvasNavMore>
    </nav>
  );

  return (
    <aside
      aria-label="Navigation"
      onPointerEnter={(e) => {
        if (hover && e.pointerType === "mouse") nav.hoverEnter();
      }}
      onPointerLeave={(e) => {
        if (hover && e.pointerType === "mouse") nav.hoverLeave();
      }}
      style={variant === "layout" ? { width: CANVAS_NAV_WIDTH_PX } : undefined}
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col bg-muted/40 p-2",
        variant === "layout" && "border-r border-border",
        hover && "absolute inset-y-0 left-0 z-40 bg-card shadow-2xl",
        className,
      )}
    >
      <div className="min-h-0 flex-1">
        <ConversationHistorySidebar
          variant="consumer"
          scopeId={historyScopeId}
          agentIds={[]}
          surfaceId="chat"
          historyLabel="Chats"
          activeConversationId={activeConversationId}
          onOpenConversation={onOpenConversation}
          openInPlace
          serverSearch
          initialSearchOpen={false}
          headerSlot={
            <>
              {header}
              {rows}
            </>
          }
          className="bg-transparent"
        />
      </div>
      <div className="shrink-0 border-t border-border pt-1.5">
        <CanvasUserRow />
      </div>
    </aside>
  );
}

/** More — the full app nav, in a flyout beside the canvas nav. */
function CanvasNavMore({ children }: { children: ReactNode }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const [open, setOpen] = useState(false);
  const items: ShellNavItem[] = navItemsForViewer(primaryNavItems, isAuthenticated);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="start" sizing="content" className="w-60 p-1.5">
        <p className="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">Everything in AI Matrx</p>
        <div className="max-h-[70dvh] overflow-y-auto">
          {items.map((item) => {
            const Icon = shellIconComponents[item.iconName];
            const className = cn(ROW_CLASS, "h-8");
            return item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={className}
                onClick={() => setOpen(false)}
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </a>
            ) : (
              <AppLink key={item.href} href={item.href} className={className} onClick={() => setOpen(false)}>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </AppLink>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
