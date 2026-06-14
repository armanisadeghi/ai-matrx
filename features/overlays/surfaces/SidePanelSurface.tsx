"use client";

// features/overlays/surfaces/SidePanelSurface.tsx
//
// SidePanelSurface — the "flexible side panel" chrome for overlay content.
//
// WHY THIS EXISTS
// The Quick Access overlays (Quick Note / Task / Chat / Data) are authored as
// bare CONTENT components (`<div className="flex flex-col h-full">…`) so they
// can be reused as tab bodies inside the Utilities Hub (`UtilitiesOverlay`) as
// well as standalone. They carry no positioning, sizing, backdrop, or z-index
// of their own.
//
// Before the May-2026 overlay/window split, the legacy `OverlaySurface` gate
// supplied that side-panel chrome. When the system was rebuilt into the
// explicit-JSX `OverlayController`, those four blocks were migrated to render
// the bare content directly — so they mounted as a zero-height `h-full` div
// under <body> and were invisible. This primitive restores the missing chrome
// as a reusable, named surface the controller wraps each block in.
//
// PRESENTATION
// Desktop: a right-anchored `Sheet` (slide-in, backdrop, ESC/overlay close).
// Mobile:  a bottom `Drawer` (vaul) — drawer-not-dialog per the mobile rules.
// Either way the content slot is a single flex column that fills the panel, so
// the child's own `h-full` layout works unchanged.

import * as React from "react";
import { X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

export interface SidePanelSurfaceProps {
  /** Visible panel title (also the accessible dialog name). */
  title: string;
  /** Optional one-line subtitle / accessible description. */
  description?: string;
  /** Fired when the user dismisses the panel (X, ESC, backdrop, drag-down). */
  onClose: () => void;
  /**
   * Desktop width. A Tailwind max-width utility applied to the Sheet content.
   * Default `sm:max-w-[460px]`. Data tables want more room — pass e.g.
   * `sm:max-w-[640px]`.
   */
  widthClassName?: string;
  /** Header controls rendered to the left of the close button (e.g. "New"). */
  headerActions?: React.ReactNode;
  /** The bare content component (owns its own internal layout/scroll). */
  children: React.ReactNode;
}

/** Compact, single-line panel header shared by both the Sheet and Drawer. */
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
  widthClassName = "sm:max-w-[460px]",
  headerActions,
  children,
}: SidePanelSurfaceProps) {
  const isMobile = useIsMobile();

  // Controlled open/close with an internal flag so the exit animation plays
  // before the controller unmounts us. The controller only mounts this surface
  // while the overlay is open, so the initial state is always `true`.
  const [open, setOpen] = React.useState(true);
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) return;
      setOpen(false);
      // Match the Sheet/Drawer close animation (~300ms) before tearing down.
      window.setTimeout(onClose, 220);
    },
    [onClose],
  );
  const requestClose = React.useCallback(
    () => handleOpenChange(false),
    [handleOpenChange],
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpenChange}>
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
    );
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        hideCloseButton
        className={cn(
          "flex w-full flex-col gap-0 p-0",
          widthClassName,
        )}
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        {description ? (
          <SheetDescription className="sr-only">{description}</SheetDescription>
        ) : null}
        <PanelHeader
          title={title}
          headerActions={headerActions}
          onRequestClose={requestClose}
        />
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
