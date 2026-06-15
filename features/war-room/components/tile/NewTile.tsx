"use client";

// features/war-room/components/tile/NewTile.tsx
//
// The always-present "start a thread" affordance. Reuses the real createTile
// thunk; on success it calls onCreated(tileId) so the caller can auto-stage the
// fresh thread (resume-where-you-left-off, but for brand-new work). Two shapes:
//   · "card" (default) — a dashed cell for the Grid gallery.
//   · "rail"           — a slim dashed row that matches the Stage rail rhythm.

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createTile } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";

export function NewTile({
  sessionId,
  nextPosition,
  variant = "card",
  onCreated,
}: {
  sessionId: string;
  nextPosition: number;
  variant?: "card" | "rail";
  onCreated?: (tileId: string) => void;
}) {
  const dispatch = useAppDispatch();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    const tile = await dispatch(createTile({ sessionId, position: nextPosition }));
    setCreating(false);
    if (tile?.id) onCreated?.(tile.id);
  }

  if (variant === "rail") {
    return (
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        className={cn(
          "group/new flex items-center gap-2.5 rounded-xl border border-dashed border-border/70 bg-transparent px-3 py-2 text-left transition-all",
          "hover:border-primary/50 hover:bg-primary/[0.03] disabled:opacity-60 disabled:pointer-events-none",
        )}
      >
        <span className="grid place-items-center size-5 shrink-0 rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover/new:bg-primary/10 group-hover/new:text-primary">
          {creating ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
        </span>
        <span className="text-[13px] font-medium text-muted-foreground group-hover/new:text-primary">
          New thread
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCreate}
      disabled={creating}
      className={cn(
        "group/new flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/70 bg-card/40 text-muted-foreground transition-all min-h-0",
        "hover:border-primary/50 hover:text-primary hover:bg-primary/[0.03]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        "disabled:opacity-60 disabled:pointer-events-none",
      )}
    >
      <span className="grid place-items-center size-10 rounded-full bg-muted/60 text-muted-foreground transition-colors group-hover/new:bg-primary/10 group-hover/new:text-primary">
        {creating ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Plus className="size-5" />
        )}
      </span>
      <span className="text-xs font-medium">New thread</span>
    </button>
  );
}
