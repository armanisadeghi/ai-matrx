"use client";

// features/war-room/components/tile/TileTabSelect.tsx
//
// The COMPACT tile view switcher for Grid mode: a single dropdown that collapses
// the six-segment TileTabBar into one button (current view's icon + a chevron,
// plus the label when the cell is wide enough). It reclaims the ~150px the
// segmented control ate from the tile header so the thread TITLE always wins the
// space fight, even at 12 tiles. The Stage tile keeps the full segmented bar
// (TileTabBar) where vertical room is plentiful — this is the dense alternative,
// nothing is lost: every tab is one click away in the menu.

import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TileFlavor, TileTab } from "@/features/war-room/types";
import {
  TILE_KIND_ORDER,
  tileTabKind,
} from "@/features/war-room/components/room/tileKind";

export function TileTabSelect({
  active,
  onChange,
  flavor,
}: {
  active: TileTab;
  onChange: (tab: TileTab) => void;
  flavor?: TileFlavor;
}) {
  const current = tileTabKind(active, flavor);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`View: ${current.label}`}
          title={`View: ${current.label}`}
          className={cn(
            "inline-flex items-center gap-1.5 h-6 pl-1.5 pr-1 shrink-0 rounded-md bg-muted/60 font-medium transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            current.text,
          )}
        >
          <current.Icon className="size-3.5 shrink-0" />
          <span className="text-[11px] @max-[18rem]:hidden">
            {current.label}
          </span>
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {TILE_KIND_ORDER.map((id) => {
          const k = tileTabKind(id, flavor);
          const isActive = id === active;
          return (
            <DropdownMenuItem
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                onChange(id);
              }}
              className={cn("gap-2", isActive && "bg-accent/60")}
            >
              <k.Icon className={cn("size-3.5 shrink-0", k.text)} />
              <span className={cn(isActive && "font-medium")}>{k.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
