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
 *   - `open`      — clicking it puts the nav into the layout; the icon moves
 *     into the nav's own header and closes it.
 *
 * The host lays it in a `DockedSidePanel` (components/official/side-panel):
 * the panel owns the width (240px default, drag to resize), the slide, and the
 * overlay placement while `overlay` is true.
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AppLink from "@/components/navigation/AppLink";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import {
  groupNavChildren,
  navItemsForViewer,
  primaryNavItems,
  type ShellNavItem,
} from "@/features/shell/constants/nav-data";
import { shellIconComponents, type ShellIconName } from "@/features/shell/shellIconMap";
import { useNavPanelActions } from "@/features/shell/navigation/navPanelActions";
import { CanvasUserRow } from "./CanvasUserRow";
import { aMenuOrPopoverIsOpen } from "./open-layer";
import {
  writeCanvasNavCookie,
  type CanvasNavPersisted,
  type CanvasNavState,
} from "./canvas-nav-cookie";

/** How far the pointer must move from a click-collapse before hover may preview again. */
const CLICK_HOVER_SLOP_PX = 40;

/** How long the pointer may be away from icon + overlay before the overlay closes. */
const HOVER_CLOSE_DELAY_MS = 160;


// ── State ───────────────────────────────────────────────────────────────────

export interface CanvasNavController {
  state: CanvasNavState;
  /**
   * The nav is shown (or is sliding away) OVER the page: true from a hover
   * preview until it is pinned open, so a preview that closes slides off the
   * page instead of pushing it while it goes.
   */
  overlay: boolean;
  open: () => void;
  /**
   * Put the nav away. A CLICK collapse (the pointer is sitting where the
   * toggle icon reappears) suppresses the hover preview until the pointer has
   * left that icon — otherwise the click reopens it at once (Arman,
   * 2026-09-27). A drag collapse passes nothing: hover stays live.
   */
  collapse: (opts?: { fromClick?: { x: number; y: number } }) => void;
  /** Pointer entered the toggle or the overlay. */
  hoverEnter: () => void;
  /** Pointer left the toggle or the overlay. */
  hoverLeave: () => void;
}

export function useCanvasNavState(initial: CanvasNavPersisted): CanvasNavController {
  const [state, setState] = useState<CanvasNavState>(initial);
  const [overlay, setOverlay] = useState(false);
  const closeTimer = useRef<number | null>(null);
  /** False from a click-collapse until the pointer is off the toggle icon. */
  const hoverArmed = useRef(true);
  const stopWatchingPointer = useRef<(() => void) | null>(null);

  const armHover = () => {
    hoverArmed.current = true;
    stopWatchingPointer.current?.();
    stopWatchingPointer.current = null;
  };
  /**
   * Re-arm once the pointer has really moved away from where it clicked (the
   * nav slides away for 600ms and carries the toggle icon under a still
   * pointer, so "not over the icon yet" is no signal), or leaves the icon.
   */
  const disarmHoverUntilPointerMovesAway = (from: { x: number; y: number }) => {
    hoverArmed.current = false;
    stopWatchingPointer.current?.();
    const onMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - from.x, e.clientY - from.y) > CLICK_HOVER_SLOP_PX) armHover();
    };
    window.addEventListener("pointermove", onMove, true);
    stopWatchingPointer.current = () => window.removeEventListener("pointermove", onMove, true);
  };

  const cancelClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(
    () => () => {
      cancelClose();
      stopWatchingPointer.current?.();
    },
    [],
  );

  return {
    state,
    overlay,
    open: () => {
      cancelClose();
      setState("open");
      setOverlay(false);
      writeCanvasNavCookie("open");
    },
    collapse: (opts) => {
      cancelClose();
      if (opts?.fromClick) disarmHoverUntilPointerMovesAway(opts.fromClick);
      setState("collapsed");
      writeCanvasNavCookie("collapsed");
    },
    hoverEnter: () => {
      if (!hoverArmed.current) return;
      cancelClose();
      if (state === "collapsed") setOverlay(true);
      setState((current) => (current === "collapsed" ? "hover" : current));
    },
    hoverLeave: () => {
      armHover();
      cancelClose();
      closeTimer.current = window.setTimeout(() => {
        // The org drop-up, the More flyout or a row menu owns the pointer.
        if (aMenuOrPopoverIsOpen()) return;
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
      data-canvas-nav-toggle=""
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
  /** `layout` = inside the host's DockedSidePanel; `sheet` = inside the mobile sheet. */
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
          onClick={hover ? nav.open : (e) => nav.collapse({ fromClick: { x: e.clientX, y: e.clientY } })}
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
    // Hover enter/leave is tracked by the host's DockedSidePanel (handle included).
    <div className={cn("flex h-full min-h-0 flex-col p-2", hover ? "bg-card" : "bg-muted/40", className)}>
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
    </div>
  );
}

/**
 * More — the WHOLE app nav beside the canvas nav: every top-level destination,
 * and each one that has sub-destinations opens them in a submenu to the right
 * (grouped as the sidebar groups them). The sub-destinations are where most of
 * the app lives (Arman, 2026-09-27) — a first-tier-only list hid them.
 */
function CanvasNavMore({ children }: { children: ReactNode }) {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const items: ShellNavItem[] = navItemsForViewer(primaryNavItems, isAuthenticated);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="min-w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Everything in AI Matrx
        </DropdownMenuLabel>
        {items.map((item) => {
          const Icon = shellIconComponents[item.iconName];
          const label = (
            <>
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </>
          );
          if (item.children && item.children.length > 0) {
            return (
              <DropdownMenuSub key={item.href}>
                <DropdownMenuSubTrigger className="gap-2.5">{label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[75dvh] min-w-56 overflow-y-auto">
                  {/* A group parent (`dashboard: false`) only organizes; any other parent is a page too. */}
                  {item.dashboard !== false ? (
                    <>
                      <NavMenuLink href={item.href} external={item.external}>
                        {label}
                      </NavMenuLink>
                      <DropdownMenuSeparator />
                    </>
                  ) : null}
                  {groupNavChildren(item.children).map((section, index) => (
                    <DropdownMenuGroup key={section.label ?? `section-${index}`}>
                      {section.label ? (
                        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                          {section.label}
                        </DropdownMenuLabel>
                      ) : null}
                      {section.items.map((child) => {
                        const ChildIcon = shellIconComponents[child.iconName];
                        return (
                          <NavMenuLink key={child.href} href={child.href}>
                            <ChildIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{child.label}</span>
                          </NavMenuLink>
                        );
                      })}
                    </DropdownMenuGroup>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          }
          return (
            <NavMenuLink key={item.href} href={item.href} external={item.external}>
              {label}
            </NavMenuLink>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavMenuLink({ href, external, children }: { href: string; external?: boolean; children: ReactNode }) {
  return (
    <DropdownMenuItem asChild className="gap-2.5">
      {external ? (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      ) : (
        <AppLink href={href}>{children}</AppLink>
      )}
    </DropdownMenuItem>
  );
}
