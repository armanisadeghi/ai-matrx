"use client";

/**
 * features/page-extraction/data-review/OpenDestinationDialog.tsx
 *
 * After we create a resource somewhere (a workbook, a data table, …) we never
 * just dump the user there. We ASK how they want to open it:
 *
 *   • Open here        → navigate the current tab
 *   • Open in new tab  → keep this dataset open, open the destination beside it
 *   • Open as window   → float it as a draggable window panel (only for targets
 *                        that have a window-panel surface — e.g. data tables via
 *                        `quickDataWindow`; workbooks are routing-only)
 *
 * Generic by design: pass a `route` (required) and an optional `windowOverlay`
 * descriptor. Any future create-flow can reuse this exact chooser.
 * Responsive: Drawer (bottom sheet) on mobile, Dialog on desktop.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, PanelRight } from "lucide-react";

import { useAppDispatch } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export interface WindowOverlayDescriptor {
  /** Registered overlayId (e.g. `quickDataWindow`). */
  overlayId: OverlayId;
  /** Data payload forwarded to the overlay (e.g. `{ selectedTable: id }`). */
  data?: Record<string, unknown>;
}

export interface OpenDestinationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Heading, e.g. "Workbook created". */
  title: string;
  /** Friendly name of the thing created — shown in the body. */
  resourceName?: string;
  /** Relative URL to the created resource (required — powers Here + New tab). */
  route: string;
  /** When present, also offer "Open as window". Omit for routing-only targets. */
  windowOverlay?: WindowOverlayDescriptor;
  /** Optional secondary note (e.g. a partial-failure warning). */
  note?: string;
}

export function OpenDestinationDialog({
  open,
  onOpenChange,
  title,
  resourceName,
  route,
  windowOverlay,
  note,
}: OpenDestinationDialogProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  const openHere = useCallback(() => {
    close();
    router.push(route);
  }, [close, router, route]);

  const openNewTab = useCallback(() => {
    close();
    window.open(route, "_blank", "noopener,noreferrer");
  }, [close, route]);

  const openWindow = useCallback(() => {
    if (!windowOverlay) return;
    close();
    dispatch(
      openOverlay({
        overlayId: windowOverlay.overlayId,
        data: windowOverlay.data,
      }),
    );
  }, [close, dispatch, windowOverlay]);

  const body = (
    <div className="flex flex-col gap-2 px-1 pb-1">
      {note && (
        <p className="rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
          {note}
        </p>
      )}
      <Button variant="default" className="justify-start" onClick={openHere}>
        <ArrowRight className="mr-2 h-4 w-4" /> Open here
      </Button>
      <Button variant="outline" className="justify-start" onClick={openNewTab}>
        <ExternalLink className="mr-2 h-4 w-4" /> Open in new tab
      </Button>
      {windowOverlay && (
        <Button
          variant="outline"
          className="justify-start"
          onClick={openWindow}
        >
          <PanelRight className="mr-2 h-4 w-4" /> Open as window
        </Button>
      )}
      <Button variant="ghost" className="justify-start" onClick={close}>
        Stay here
      </Button>
    </div>
  );

  const description = resourceName
    ? `“${resourceName}” is ready. How would you like to open it?`
    : "How would you like to open it?";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="bg-textured pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-textured sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
