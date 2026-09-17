"use client";

// features/overlays/surfaces/SidePanelSurface.tsx
//
// SidePanelSurface — non-blocking floating panel chrome for Quick Access overlays.
// Desktop: `MatrxDynamicPanelHost` (repositionable, drag-resize, no backdrop).
// Mobile: bottom Drawer per mobile rules.
//
// Content components stay bare (`h-full` layout) so they can also live inside
// the Utilities Hub tabs unchanged.

import * as React from "react";
import { X } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import {
  MatrxDynamicPanelHost,
  sidePanelWidthToPercent,
} from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface SidePanelSurfaceContextValue {
  requestWidthBoost: (px: number) => void;
}

const SidePanelSurfaceContext =
  React.createContext<SidePanelSurfaceContextValue | null>(null);

export function useSidePanelSurface(): SidePanelSurfaceContextValue | null {
  return React.useContext(SidePanelSurfaceContext);
}

export interface SidePanelSurfaceProps {
  /**
   * Plain-text title. Kept a string because it is also the accessible name
   * (`DrawerTitle`, `expandButtonLabel`) — a ReactNode there reads as noise.
   */
  title: string;
  /**
   * Rich title, rendered INSTEAD of `title` in the visible header. This is how
   * a panel puts a door on the record it names (`EntityRef`) without losing the
   * accessible name. Panels used to type `title` as `string` while the host
   * accepted a ReactNode, so a caller passing JSX had it silently coerced away
   * and the door simply never rendered.
   */
  titleNode?: React.ReactNode;
  description?: React.ReactNode;
  onClose: () => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

const ENTER_MS = 200;

/**
 * The drawer form's header (a docked panel on a phone). Exported so its layout
 * can be asserted without booting the whole surface.
 *
 * 🚨 NEW-4 — THE NAME HAS PRIORITY, AND THE CLUSTER WRAPS. The title used to be
 * `flex-1` beside a `shrink-0` action cluster: under `@media (pointer: coarse)`
 * every action icon is 40px, so on a 390px phone a Detail panel's cluster (two
 * presentation icons, copy, and previous/next with a list context) is roughly
 * 300px and the record's name was left ~50px — D2's defect, in the presentation
 * D2 was never measured in (VERIFY-U-P1-R2; geometric, NO SCREEN WAS SEEN). Now
 * the row WRAPS: the name and the close control hold the first line at any width,
 * and the cluster takes a second line when it does not fit beside them. On a
 * wide viewport (`sm:`) everything sits on one line as before — and `sm:` is the
 * right tool here, unlike inside a window, because this drawer IS the viewport.
 */
export function PanelHeader({
  title,
  headerActions,
  onRequestClose,
}: {
  title: React.ReactNode;
  headerActions?: React.ReactNode;
  onRequestClose: () => void;
}) {
  return (
    <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/40 px-3 py-1">
      <span
        className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
        data-panel-title
      >
        {title}
      </span>
      <button
        type="button"
        onClick={onRequestClose}
        aria-label="Close panel"
        className="order-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:order-last pointer-coarse:h-10 pointer-coarse:w-10"
      >
        <X className="h-4 w-4" />
      </button>
      {headerActions ? (
        <div
          className="order-last flex w-full min-w-0 items-center justify-end sm:order-none sm:w-auto sm:justify-start"
          data-panel-header-actions
        >
          {headerActions}
        </div>
      ) : null}
    </div>
  );
}

export function SidePanelSurface({
  title,
  titleNode,
  description,
  onClose,
  defaultWidth = 460,
  minWidth = 360,
  maxWidth = 900,
  headerActions,
  children,
}: SidePanelSurfaceProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(true);
  const [widthBoost, setWidthBoost] = React.useState(0);
  const [viewportWidth, setViewportWidth] = React.useState(() =>
    typeof window === "undefined" ? 1440 : window.innerWidth,
  );

  React.useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const ctx = React.useMemo<SidePanelSurfaceContextValue>(
    () => ({ requestWidthBoost: (px) => setWidthBoost(Math.max(0, px)) }),
    [],
  );

  const closeTimer = React.useRef<number | null>(null);
  const requestClose = React.useCallback(() => {
    if (closeTimer.current != null) return;
    setOpen(false);
    closeTimer.current = window.setTimeout(onClose, ENTER_MS + 20);
  }, [onClose]);

  React.useEffect(
    () => () => {
      if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  const handleDrawerOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) requestClose();
    },
    [requestClose],
  );

  const minPct = sidePanelWidthToPercent(minWidth, viewportWidth);
  const maxPct = sidePanelWidthToPercent(maxWidth, viewportWidth);
  const defaultPct =
    sidePanelWidthToPercent(defaultWidth, viewportWidth, minPct, maxPct) +
    sidePanelWidthToPercent(widthBoost, viewportWidth, 0, 30);

  if (isMobile) {
    return (
      <SidePanelSurfaceContext.Provider value={ctx}>
        <Drawer open={open} onOpenChange={handleDrawerOpenChange}>
          <DrawerContent className="h-[88dvh] gap-0 p-0">
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
            {description ? (
              <DrawerDescription className="sr-only">
                {description}
              </DrawerDescription>
            ) : null}
            <PanelHeader
              title={titleNode ?? title}
              headerActions={headerActions}
              onRequestClose={requestClose}
            />
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
          </DrawerContent>
        </Drawer>
      </SidePanelSurfaceContext.Provider>
    );
  }

  return (
    <SidePanelSurfaceContext.Provider value={ctx}>
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
        title={titleNode ?? title}
        description={description}
        headerActions={headerActions}
        expandButtonLabel={title}
        position="right"
        defaultSize={Math.min(maxPct, defaultPct)}
        minSize={minPct}
        maxSize={maxPct}
        contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
        // 🚨 A DOCKED PANEL STARTS BELOW THE APP SHELL HEADER. The host's
        // container is `fixed inset-y-0`, so every panel that uses this
        // surface used to begin at y=0 and draw its own title row, id chip and
        // icons on top of the shell header's right-hand cluster — the org
        // switcher, search and avatar were under it and unclickable
        // (VERIFY-U-P1, D3, seen on the Detail primitive's docked
        // presentation). The padding is on the FIXED CONTAINER, so the panel
        // card's `h-full` resolves against the remaining height: the class is
        // fixed once here for every docked panel, not offset per panel.
        //
        // 🚨 THE HEIGHT IS `--shell-header-h`, AND IT IS THE ONLY TRUTH FOR IT.
        // `--header-height` (globals.css, 2.5rem) is the token the pre-shell
        // ResponsiveLayout pages were authored against; the app shell's own
        // header is `--shell-header-h` (styles/shell.css, 2.75rem — 2.5rem only
        // under `/administration`, where that sheet re-declares it for the
        // legacy admin tree). Reserving 2.5rem under a 2.75rem header left the
        // panel 4px over the header's right-hand cluster, which is the whole
        // D3 defect reappearing at 4px (Bugbot, frontend PR 228). No third
        // token: the surface asks for the shell's own value.
        //
        // The value crosses a PORTAL. `MatrxDynamicPanelHost` renders into
        // `#glass-layer`, a direct child of <body> outside `.shell-root`, so a
        // value declared on `.shell-root` could never reach it by inheritance.
        // That is why `styles/shell.css` declares the admin tree's 2.5rem on
        // <body> (§ Admin tree compatibility) — ONE declaration the shell
        // subtree and the portal layer both inherit. The `0px` fallback is not a
        // guess: a route that does not mount `AppShell` never loads that sheet
        // AND never renders a shell header, so there is nothing to clear.
        className={cn("z-40 pt-[var(--shell-header-h,0px)]")}
      >
        {children}
      </MatrxDynamicPanelHost>
    </SidePanelSurfaceContext.Provider>
  );
}
