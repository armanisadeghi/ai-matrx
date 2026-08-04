"use client";

/**
 * The watch toggle — one small eye button used by every Search Console
 * table cell and the Watchlist rows. Pure presentation; state/toggling
 * lives in `hooks/useWatchState.ts`.
 */

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function WatchButton({
  watched,
  pending,
  onToggle,
  noun,
}: {
  watched: boolean;
  pending: boolean;
  onToggle: () => void;
  noun: string;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn(
        "h-6 w-6 p-0",
        watched
          ? "text-primary hover:text-primary"
          : "text-muted-foreground/50 hover:text-foreground",
      )}
      aria-label={watched ? `Stop watching this ${noun}` : `Watch this ${noun}`}
      title={
        watched
          ? `Stop watching this ${noun}`
          : `Watch this ${noun} — it appears on the Watchlist tab`
      }
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : watched ? (
        <Eye className="h-3.5 w-3.5" />
      ) : (
        <EyeOff className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
