"use client";

// features/war-room/components/tile/TileTabBar.tsx
//
// The tile view switcher: a compact segmented control (one connected pill) with
// a single "lit" segment, kind-colored to match the tile accent rail. Icon-only
// by default — it lives inline in the tile header (no separate row, no labels),
// so the icons are self-explanatory and reclaim vertical space. The Stage tile
// opts into labels via `withLabels` + `size="md"`. Self-explanatory, one active
// at a time — the busy user never hunts for which view they're in.

import { cn } from "@/lib/utils";
import type { TileTab } from "@/features/war-room/types";
import { TILE_KIND_ORDER, tileKindOf } from "@/features/war-room/components/room/tileKind";

export function TileTabBar({
  active,
  onChange,
  withLabels = false,
  size = "sm",
}: {
  active: TileTab;
  onChange: (tab: TileTab) => void;
  withLabels?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5 shrink-0"
      role="tablist"
    >
      {TILE_KIND_ORDER.map((id) => {
        const k = tileKindOf(id);
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={k.label}
            onClick={(e) => {
              e.stopPropagation();
              onChange(id);
            }}
            className={cn(
              "inline-flex items-center justify-center gap-1 rounded-md font-medium transition-all duration-150",
              size === "md" ? "h-7 px-2" : "h-6 px-1.5",
              isActive
                ? cn("bg-card shadow-[var(--elevation-1)]", k.text)
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <k.Icon className={size === "md" ? "size-4" : "size-3.5"} />
            {withLabels ? (
              <span className="text-[11px] @max-[26rem]:hidden">{k.label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
