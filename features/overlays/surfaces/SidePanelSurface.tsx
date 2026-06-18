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
  title: string;
  description?: string;
  onClose: () => void;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  storageKey?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

const ENTER_MS = 200;

function PanelHeader({
  title,
  headerActions,
  onRequestClose,
}: {
  title: React.ReactNode;
  headerActions?: React.ReactNode;
  onRequestClose: () => void;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3">
      <span className="flex-1 truncate text-sm font-semibold text-foreground">
        {title}
      </span>
      {headerActions}
      <button
        type="button"
        onClick={onRequestClose}
        aria-label="Close panel"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function SidePanelSurface({
  title,
  description,
  onClose,
  defaultWidth = 460,
  minWidth = 360,
  maxWidth = 900,
  headerActions,
  children,
}: SidePanelSurfaceProps) {
  const isQuickNotesPanel = title === "Quick Note";
  React.useEffect(() => {
    if (isQuickNotesPanel) {
      console.log(
        "[Track Quick Notes] 1, SidePanelSurface.tsx — Quick Notes side panel mounted",
        { title, defaultWidth },
      );
    }
  }, [isQuickNotesPanel, title, defaultWidth]);

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
              title={title}
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
        title={title}
        description={description}
        headerActions={headerActions}
        expandButtonLabel={title}
        position="right"
        defaultSize={Math.min(maxPct, defaultPct)}
        minSize={minPct}
        maxSize={maxPct}
        contentClassName="flex h-full min-h-0 flex-col overflow-hidden p-0"
        className={cn("z-40")}
      >
        {children}
      </MatrxDynamicPanelHost>
    </SidePanelSurfaceContext.Provider>
  );
}
