"use client";

/**
 * The brand workspace's Press Room — the canonical `PressRoomWorkspace`, told
 * which brand it is standing in, with the PR Director beside it.
 *
 * Without the scoping the workspace defaulted to the first brand alphabetically
 * across the entire platform, so `/marketing/<client>/pr` showed a different
 * client's stories, journalists and pitches under the requested client's name.
 *
 * The brand comes from `MarketingBrandProvider` (a real UUID), never from the
 * route param — the param is an address and is usually a key.
 *
 * THE DIRECTOR: a side column at desktop widths; on a phone, one button opens it
 * over the page. ONE panel instance either way, so one conversation.
 */

import { useState } from "react";
import { Megaphone, PanelRightClose, X } from "lucide-react";

import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { cn } from "@/lib/utils";

import PressRoomWorkspace from "./PressRoomWorkspace";
import { PrDirectorPanel } from "./director/PrDirectorPanel";
import { useDirectorDock } from "./director/director-dock";

export function BrandScopedPressRoom() {
  const brand = useMarketingBrand();
  // Phone: the Director opens over the page. Wide screen: it docks beside the Press Room, closed
  // by default where it would squeeze the angle list (see director-dock.ts).
  const [directorOpen, setDirectorOpen] = useState(false);
  const [docked, setDocked] = useDirectorDock();
  return (
    <div className="flex h-full min-h-0">
      <div className="h-full min-w-0 flex-1">
        <PressRoomWorkspace scopedBrandId={brand.id} />
      </div>
      <aside
        aria-label="PR Director column"
        className={cn(
          "flex-col border-l bg-background lg:static lg:z-auto lg:w-[420px] lg:shrink-0",
          docked ? "lg:flex" : "lg:hidden",
          directorOpen
            ? "fixed inset-x-0 bottom-0 top-[var(--shell-header-h)] z-40 flex"
            : "hidden",
        )}
      >
        <div className="flex items-center justify-end gap-1 border-b px-3 py-1.5 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => setDirectorOpen(false)}
            className="flex items-center gap-1 lg:hidden"
          >
            <X className="size-3.5" aria-hidden />
            Back to the press room
          </button>
          <button
            type="button"
            onClick={() => setDocked(false)}
            className="hidden items-center gap-1 hover:text-foreground lg:flex"
          >
            <PanelRightClose className="size-3.5" aria-hidden />
            Hide the PR Director
          </button>
        </div>
        <PrDirectorPanel
          brandId={brand.id}
          brandName={brand.name}
          organizationId={brand.organizationId}
        />
      </aside>
      {!directorOpen ? (
        <button
          type="button"
          onClick={() => setDirectorOpen(true)}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-1.5 rounded-full border bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-lg lg:hidden"
        >
          <Megaphone className="size-3.5" aria-hidden />
          PR Director
        </button>
      ) : null}
      {!docked ? (
        <button
          type="button"
          onClick={() => setDocked(true)}
          className="fixed bottom-4 right-4 z-30 hidden items-center gap-1.5 rounded-full border bg-primary px-3 py-2 text-xs font-medium text-primary-foreground shadow-lg lg:flex"
        >
          <Megaphone className="size-3.5" aria-hidden />
          PR Director
        </button>
      ) : null}
    </div>
  );
}
