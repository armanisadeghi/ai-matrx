"use client";

/**
 * ListDetailSplit — a list with its record's detail docked on the right, on
 * THE docked side panel (motion-standard law, common-docs/policies/motion-standard.md).
 *
 *   - Desktop: the detail is a `DockedSidePanel` — it slides open and closed on
 *     the panel motion while its content keeps its own width (never squeezed
 *     through every intermediate width), the person drags its edge to resize
 *     (remembered per `panelId`), and a closed panel stays mounted and `inert`.
 *   - The host can clear its selection the moment it closes (`detail` becomes
 *     null): the panel keeps showing the detail it had, frozen, so it slides
 *     out with its content instead of an empty box. Each opening starts the
 *     detail fresh (a new record, or "new" again after a save, never shows the
 *     previous form).
 *   - Phone: list → detail is navigation, not a panel — the detail fills the
 *     screen while open and the list stays mounted underneath (its scroll kept).
 */

import { Fragment, useState, type ReactNode } from "react";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { cn } from "@/lib/utils";
import { DockedSidePanel } from "./DockedSidePanel";
import type { SidePanelSizes } from "./side-panel-width";

const DEFAULT_DETAIL_SIZES: SidePanelSizes = { defaultPx: 640, minPx: 380, maxPx: 1100 };

export interface ListDetailSplitProps {
  /** Stable id: the detail's remembered width is stored under it. */
  panelId: string;
  open: boolean;
  list: ReactNode;
  /** The detail while open; the host may pass null once closed. */
  detail: ReactNode;
  "aria-label": string;
  sizes?: SidePanelSizes;
  /** Largest share of the split the detail may take (default 0.6). */
  maxShare?: number;
  /** Server-read remembered width (`readSidePanelWidth`). */
  initialWidth?: number;
  onCollapse?: () => void;
  className?: string;
  listClassName?: string;
  /** Classes for the detail body. */
  detailClassName?: string;
}

/** The detail last seen open, and how many times the panel has opened. */
interface HeldDetail {
  open: boolean;
  detail: ReactNode;
  generation: number;
}

export function ListDetailSplit({
  panelId,
  open,
  list,
  detail,
  sizes = DEFAULT_DETAIL_SIZES,
  maxShare,
  initialWidth,
  onCollapse,
  className,
  listClassName,
  detailClassName,
  "aria-label": ariaLabel,
}: ListDetailSplitProps) {
  const isMobile = useIsMobile();
  const [held, setHeld] = useState<HeldDetail>({ open, detail: open ? detail : null, generation: open ? 1 : 0 });

  // Render-phase sync (React's "adjust state while rendering"): the re-render
  // React runs immediately carries the same props, so it settles in one pass.
  if (open && (!held.open || held.detail !== detail)) {
    setHeld({ open: true, detail, generation: held.open ? held.generation : held.generation + 1 });
  } else if (!open && held.open) {
    setHeld({ open: false, detail: held.detail, generation: held.generation });
  }

  const shown = open ? detail : held.detail;

  return (
    <div className={cn("flex h-full min-h-0 overflow-hidden", className)}>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col overflow-hidden",
          isMobile && open && "hidden",
          listClassName,
        )}
      >
        {list}
      </div>
      {isMobile ? (
        open ? (
          <div className={cn("flex w-full min-w-0 flex-col overflow-hidden", detailClassName)}>{detail}</div>
        ) : null
      ) : (
        <DockedSidePanel
          panelId={panelId}
          edge="right"
          open={open}
          sizes={sizes}
          maxShare={maxShare}
          initialWidth={initialWidth}
          onCollapse={onCollapse}
          aria-label={ariaLabel}
          className={cn("overflow-hidden border-l-2 border-l-primary/20", detailClassName)}
        >
          <Fragment key={held.generation}>{shown}</Fragment>
        </DockedSidePanel>
      )}
    </div>
  );
}
