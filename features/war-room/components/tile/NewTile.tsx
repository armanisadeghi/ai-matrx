"use client";

// features/war-room/components/tile/NewTile.tsx
//
// The always-present empty tile. Wave 2: click to add a blank tile so the
// gallery is easy to grow and test. Wave 3 turns this into an inline capture
// surface (type a note / name a task and it promotes to a real tile).

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createTile } from "@/features/war-room/redux/thunks";
import { cn } from "@/lib/utils";

export function NewTile({
  sessionId,
  nextPosition,
}: {
  sessionId: string;
  nextPosition: number;
}) {
  const dispatch = useAppDispatch();
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (creating) return;
    setCreating(true);
    await dispatch(createTile({ sessionId, position: nextPosition }));
    setCreating(false);
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
      <span className="text-xs font-medium">New tile</span>
    </button>
  );
}
