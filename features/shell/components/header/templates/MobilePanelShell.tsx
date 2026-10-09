"use client";

// MobilePanelShell — the drop-in mobile treatment for any multi-pane route
// (IDE, split editors, sidebar+detail workspaces, inspector rails).
//
// Wide: renders `desktop` VERBATIM. Whatever resizable/split layout the route
//       already has is untouched — zero regression risk.
// Compact: renders `main` as one full-height scrolling column, and each side
//          panel becomes an iOS-style BOTTOM DRAWER reachable from ONE header
//          tap target. The default boundary is `md`; dense workspaces may opt
//          into `lg`, `xl`, or `2xl` with `collapseBelow`.
//
//   <MobilePanelShell
//     desktop={<ResizablePanelGroup>…existing layout…</ResizablePanelGroup>}
//     main={<Editor />}
//     panels={[
//       { id: "files", label: "Files", icon: Folder, content: <FileTree /> },
//       { id: "chat",  label: "Chat",  icon: MessageCircle, content: <ChatPanel /> },
//     ]}
//   />
//
// Rules this encodes (see .claude/skills/core-route-headers/SKILL.md):
//   - Few things in the phone header; everything else in a drawer.
//   - Tap targets carry their own 44px geometry — never wrap them in padding.
//   - The route body still owns header clearance (pt-[var(--shell-header-h)]);
//     this component does not add chrome to the body.
//
// Panels are mounted lazily (only once opened) so a phone never pays to render
// an inspector the user hasn't asked for. Pass `alwaysMount` for a panel that
// must keep live state (e.g. a running terminal).
//
// Close-on-ACTION (opt-in): route changes auto-dismiss the drawer, but a panel
// action that is NOT navigation (pick a session, run Clean Up, select a store
// via a search param) leaves the drawer covering the result. Panel content can
// call `useMobilePanelClose()` — a no-op outside the drawer (desktop renders
// the same component) — right where the action fires.
//
// Open-from-MAIN: a page's primary action must never live only in a drawer.
// When the main column needs a door INTO a drawer (an empty pane's "Browse
// stores"), it calls `useOpenMobilePanel()` — null on desktop, so no button.

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useMediaQuery } from "@ai-matrx/kit/media-query";
import PageHeaderRightPortal from "@/features/shell/components/header/PageHeaderRightPortal";
import { TapTargetButtonTransparent } from "@ai-matrx/design-system/tap-target";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { Badge } from "@ai-matrx/design-system/controls";

const MobilePanelCloseContext = createContext<() => void>(() => {});

/**
 * Close the enclosing MobilePanelShell drawer after a non-navigation action
 * (picking an item, firing a run). Safe to call anywhere: outside a drawer —
 * including the desktop rendering of the same component — it is a no-op.
 */
export function useMobilePanelClose(): () => void {
  return useContext(MobilePanelCloseContext);
}

const MobilePanelOpenContext = createContext<((id: string) => void) | null>(
  null,
);

/**
 * Open one of the enclosing MobilePanelShell's drawers by panel id from the
 * MAIN column — e.g. an empty main pane's "Browse stores" button. Returns
 * `null` when there is no drawer to open (desktop, where the panel is already
 * on screen, or the stacked presentation), so the caller renders no button
 * rather than a dead one.
 */
export function useOpenMobilePanel(): ((id: string) => void) | null {
  return useContext(MobilePanelOpenContext);
}

export interface MobileShellPanel {
  id: string;
  label: string;
  icon?: LucideIcon;
  content: React.ReactNode;
  /**
   * How many things in this panel are waiting on the user (open questions,
   * unread items, failures). Printed beside the panel's name in the picker,
   * and summed onto the header trigger — otherwise a phone user has no way to
   * know a drawer they cannot see is holding work for them. `0`/undefined
   * prints nothing; a panel with nothing pending must not wear a "0".
   */
  badge?: number;
  /** Keep mounted (hidden) instead of lazy-mounting on first open. */
  alwaysMount?: boolean;
  /** Optional controlled state for stacked disclosures. */
  open?: boolean;
  /** Reports a user toggle for a controlled stacked disclosure. */
  onOpenChange?: (open: boolean) => void;
}

export interface MobilePanelShellProps {
  /** The desktop layout, rendered verbatim at >= md. */
  desktop: React.ReactNode;
  /** The primary pane on a phone (editor, document, conversation…). */
  main: React.ReactNode;
  /** Secondary panes — each becomes a bottom drawer on a phone. */
  panels?: MobileShellPanel[];
  /** Extra class on the mobile main column. */
  mainClassName?: string;
  /**
   * Icon for the panels trigger. Defaults to the "…" glyph, which is right
   * when this shell owns the only overflow control on the route — but a route
   * whose header is an `EntityModeHeader` ALREADY shows a "…" for its modes
   * and actions, and two identical glyphs side by side say nothing about
   * which is which. Such a route passes its own icon.
   */
  menuIcon?: LucideIcon;
  /** Accessible name + sheet title for the panels trigger. Default "Panels". */
  menuLabel?: string;
  /** Collapse a dense desktop workspace before phone width. */
  collapseBelow?: "md" | "lg" | "xl" | "2xl";
  /** Keep workspace tools in an accessible vertical stack on compact screens.
   * Native disclosures keep live children mounted when collapsed. */
  presentation?: "drawers" | "stacked";
}

const COLLAPSE_MAX_WIDTH = {
  md: 767,
  lg: 1023,
  xl: 1279,
  "2xl": 1535,
} as const;

export function MobilePanelShell({
  desktop,
  main,
  panels,
  mainClassName,
  menuIcon: menuIconProp,
  menuLabel: menuLabelProp,
  collapseBelow = "md",
  presentation = "drawers",
}: MobilePanelShellProps) {
  const MenuIcon = menuIconProp ?? MoreHorizontal;
  const menuLabel = menuLabelProp ?? "Panels";
  const isMobile = useIsMobile();
  const compactWorkspace = useMediaQuery(
    `(max-width: ${COLLAPSE_MAX_WIDTH[collapseBelow]}px)`,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [openPanelId, setOpenPanelId] = useState<string | null>(null);
  const [everOpened, setEverOpened] = useState<Set<string>>(() => new Set());

  // A panel typically hosts real navigation (e.g. a settings/section tree of
  // <Link>s). Once a route change lands, auto-dismiss so the user sees the
  // page they just navigated to instead of the drawer still covering it.
  // (Adjusting state during render on prop change — see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  // — rather than a `useEffect`, which would cause an extra commit.)
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpenPanelId(null);
    setMenuOpen(false);
  }

  const usePanelMode = collapseBelow === "md" ? isMobile : compactWorkspace;
  if (!usePanelMode) return <>{desktop}</>;

  const hasPanels = Boolean(panels && panels.length > 0);
  const openPanel = panels?.find((p) => p.id === openPanelId) ?? null;
  // What the drawers are holding, added up for the one control that can be
  // seen. A panel behind a "…" is invisible; a count is the only honest way to
  // say it is not empty.
  const pendingTotal = (panels ?? []).reduce(
    (sum, p) => sum + Math.max(0, p.badge ?? 0),
    0,
  );

  const show = (id: string) => {
    setEverOpened((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
    setMenuOpen(false);
    setOpenPanelId(id);
  };

  const closeAll = () => {
    setOpenPanelId(null);
    setMenuOpen(false);
  };

  if (presentation === "stacked") {
    return (
      <div className="h-full w-full min-w-0 overflow-y-auto overscroll-contain pb-safe">
        <div
          className={cn("h-[65dvh] min-h-80 overflow-hidden", mainClassName)}
        >
          {main}
        </div>
        {panels?.map((panel) => {
          const Icon = panel.icon;
          return (
            <details
              key={panel.id}
              className="group border-t border-border bg-card"
              open={panel.open}
              onToggle={(event) =>
                panel.onOpenChange?.(event.currentTarget.open)
              }
            >
              <summary className="min-h-11 cursor-pointer px-4 py-3 type-title text-foreground marker:text-muted-foreground">
                {Icon && (
                  <Icon className="mr-2 inline-block h-4 w-4" aria-hidden />
                )}
                {panel.label}
              </summary>
              <div className="h-[60dvh] min-h-72 min-w-0 overflow-hidden">
                {panel.content}
              </div>
            </details>
          );
        })}
      </div>
    );
  }

  // ONE sheet for the picker AND the opened panel. Two sibling sheets (picker
  // closes, panel opens in the same tap) never worked: the closing sheet hands
  // focus back to its trigger, which sits outside the opening sheet, and the
  // new sheet dismissed itself on that focus-outside — so "Panels → Sessions"
  // closed everything and showed nothing (found 2026-10-05 on
  // /transcripts/studio). Swapping the content of one open sheet cannot race.
  // A single panel skips the picker: the trigger IS that panel's door.
  const singlePanel = panels?.length === 1 ? panels[0] : null;
  // A route that named its own trigger keeps it; otherwise the lone panel's
  // own name and icon stand in for the generic "Panels" "…".
  const TriggerIcon = (singlePanel && !menuIconProp && singlePanel.icon) || MenuIcon;
  const triggerLabel = (singlePanel && !menuLabelProp && singlePanel.label) || menuLabel;
  const openTrigger = () =>
    singlePanel ? show(singlePanel.id) : setMenuOpen(true);
  const sheetOpen = menuOpen || Boolean(openPanel);
  const sheetTitle = openPanel?.label ?? menuLabel;

  return (
    <>
      {hasPanels && (
        <PageHeaderRightPortal>
          <span className="relative inline-flex">
            <TapTargetButtonTransparent
              icon={<TriggerIcon className="h-4 w-4" />}
              ariaLabel={
                pendingTotal > 0
                  ? `${triggerLabel} — ${pendingTotal} waiting on you`
                  : triggerLabel
              }
              onClick={openTrigger}
            />
            {pendingTotal > 0 && (
              <span
                aria-hidden
                className="pointer-events-none absolute right-0 top-0.5 min-w-[17px] rounded-full bg-primary px-1 text-center type-meta font-semibold leading-[17px] text-primary-foreground"
              >
                {pendingTotal > 99 ? "99+" : pendingTotal}
              </span>
            )}
          </span>
        </PageHeaderRightPortal>
      )}

      <div className={cn("h-full min-h-0 overflow-auto", mainClassName)}>
        <MobilePanelOpenContext.Provider value={hasPanels ? show : null}>
          {main}
        </MobilePanelOpenContext.Provider>
      </div>

      {/* Panels that opted out of lazy mounting stay alive off-screen. */}
      <MobilePanelCloseContext.Provider value={closeAll}>
        {panels
          ?.filter((p) => p.alwaysMount && p.id !== openPanelId)
          .map((p) => (
            <div key={p.id} className="hidden" aria-hidden>
              {p.content}
            </div>
          ))}
      </MobilePanelCloseContext.Provider>

      {hasPanels && (
        <BottomSheet
          open={sheetOpen}
          onOpenChange={(next) => !next && closeAll()}
          title={sheetTitle}
        >
          <BottomSheetHeader
            title={sheetTitle}
            trailing={
              <button
                onClick={closeAll}
                className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
              >
                Done
              </button>
            }
          />
          <BottomSheetBody>
            {!openPanel &&
              panels?.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => show(p.id)}
                    className="flex min-h-[52px] w-full items-center border-b border-glass-edge px-5 text-left transition-colors last:border-0 active:bg-glass-active"
                  >
                    {Icon && (
                      <Icon className="mr-3 h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 text-[15px]">{p.label}</span>
                    {(p.badge ?? 0) > 0 && (
                      <Badge tone="primary" className="ml-3">
                        {p.badge}
                      </Badge>
                    )}
                  </button>
                );
              })}
            <div className={cn("max-h-[70dvh] overflow-auto", !openPanel && "hidden")}>
              <MobilePanelCloseContext.Provider value={closeAll}>
                {panels
                  ?.filter((p) => p.alwaysMount || everOpened.has(p.id))
                  .map((p) => (
                    <div
                      key={p.id}
                      className={cn(p.id !== openPanelId && "hidden")}
                    >
                      {p.content}
                    </div>
                  ))}
              </MobilePanelCloseContext.Provider>
            </div>
          </BottomSheetBody>
        </BottomSheet>
      )}
    </>
  );
}
