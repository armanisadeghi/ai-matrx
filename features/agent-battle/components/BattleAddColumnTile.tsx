"use client";

import { Plus } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { addBattleColumn } from "../redux/thunks";

/**
 * BattleAddColumnTile — trailing "+" tile at the end of the column strip.
 * Lives outside the resizable group so it doesn't fight the panel layout.
 */
export function BattleAddColumnTile() {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      onClick={() => dispatch(addBattleColumn())}
      className="h-full w-12 shrink-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 border-l border-border transition-colors"
      title="Add a column"
    >
      <Plus className="w-5 h-5" />
      <span className="text-[10px] uppercase tracking-wider rotate-180 [writing-mode:vertical-rl]">
        Add agent
      </span>
    </button>
  );
}
