"use client";

// PinButton — the one control for pinning anything to favorites.
//
// Drop it on a card, a row, a detail header — anywhere. It self-manages state
// via usePinned() (preferences-backed, synced, instant). A pinned item shows in
// BOTH the dashboard "Pinned" grid and the sidebar Favorites menu.
//
// Usage:
//   <PinButton item={{ id: "/research", kind: "nav", label: "Research",
//                       href: "/research", iconName: "Telescope", color: "sky" }} />
//   <PinButton item={{ id: favoriteId("agent", agent.id), kind: "agent",
//                       label: agent.name, href: `/agents/${agent.id}` }} size="sm" />

import { Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePinned, type FavoriteInput } from "./usePinned";

export interface PinButtonProps {
  /** The favorite to toggle. `id` must be stable — use favoriteId() for records. */
  item: FavoriteInput;
  /** Visual size. */
  size?: "sm" | "md";
  /** Show a toast on pin/unpin. Default true. */
  notify?: boolean;
  /** Extra classes for the button. */
  className?: string;
  /** Stop the click from bubbling (e.g. when nested in a clickable card). Default true. */
  stopPropagation?: boolean;
}

const SIZES = {
  sm: { btn: "h-7 w-7", icon: 14 },
  md: { btn: "h-9 w-9", icon: 17 },
} as const;

export function PinButton({
  item,
  size = "md",
  notify = true,
  className,
  stopPropagation = true,
}: PinButtonProps) {
  const { isPinned, toggle } = usePinned();
  const pinned = isPinned(item.id);
  const dims = SIZES[size];

  const onClick = (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.preventDefault();
      e.stopPropagation();
    }
    const nowPinned = toggle(item);
    if (notify) {
      if (nowPinned) toast.success(`Pinned ${item.label}`);
      else toast.success(`Unpinned ${item.label}`);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pinned}
      aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
      title={pinned ? "Unpin from favorites" : "Pin to favorites"}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-colors",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dims.btn,
        pinned
          ? "text-amber-500"
          : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      <Star
        size={dims.icon}
        strokeWidth={2}
        className={pinned ? "fill-amber-500" : "fill-transparent"}
      />
    </button>
  );
}

export default PinButton;
