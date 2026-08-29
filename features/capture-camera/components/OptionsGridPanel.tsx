"use client";

/**
 * OptionsGridPanel — the iPhone two-tap options surface: tapping the grid
 * button dims the viewfinder and reveals a rounded dark panel pinned to the
 * bottom holding a grid of circular toggle buttons with uppercase labels
 * (one tap to reveal, one tap to act). This is NOT a drawer — no drag
 * handle, no route; tapping the scrim or the grid button again closes it.
 *
 * Tiles are injected (`CaptureOptionTile[]`) so hosts and domain extensions
 * add their own toggles without touching the panel.
 *
 * Package source (`@ai-matrx/capture`) — presentational only.
 */

import React from "react";
import { cn } from "@/lib/utils";
import type { CaptureOptionTile } from "../types";

export interface OptionsGridPanelProps {
  open: boolean;
  onClose: () => void;
  tiles: CaptureOptionTile[];
}

export function OptionsGridPanel({
  open,
  onClose,
  tiles,
}: OptionsGridPanelProps) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40">
      {/* Dimming scrim — the viewfinder darkens like iOS; tap to dismiss. */}
      <button
        type="button"
        aria-label="Close camera options"
        onClick={onClose}
        className="absolute inset-0 bg-black/70"
      />
      <div className="absolute inset-x-3 bottom-3 mb-safe rounded-[2.5rem] bg-[#3a3a3c]/95 px-6 py-8 shadow-2xl">
        <div className="grid grid-cols-3 gap-x-4 gap-y-7">
          {tiles.map((tile) => (
            <div key={tile.id} className="flex flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={tile.onPress}
                disabled={tile.disabled}
                aria-label={tile.label}
                aria-pressed={tile.active === true}
                className={cn(
                  "flex h-16 w-16 touch-manipulation items-center justify-center rounded-full bg-[#2c2c2e] transition-colors",
                  tile.active ? "text-[#FFCC00]" : "text-white",
                  tile.disabled && "opacity-40",
                )}
              >
                {tile.icon}
              </button>
              <span className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white">
                {tile.valueLabel ? `${tile.label} ${tile.valueLabel}` : tile.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
