"use client";

import { Plus } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { addBattleColumn } from "../redux/thunks";

/**
 * BattleAddColumnTile — prominent trailing "+" rail at the end of the column
 * strip. Sized + colored to stand out so the right-edge affordance is hard
 * to miss; the toolbar also exposes the same action.
 */
export function BattleAddColumnTile() {
  const dispatch = useAppDispatch();
  return (
    <button
      type="button"
      onClick={() => dispatch(addBattleColumn())}
      title="Add a column"
      className="group h-full w-16 shrink-0 flex flex-col items-center justify-center gap-2 border-l-2 border-dashed border-primary/50 bg-primary/5 hover:bg-primary/15 hover:border-primary transition-colors"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center bg-primary text-primary-foreground shadow-md group-hover:scale-110 transition-transform">
        <Plus className="w-5 h-5" strokeWidth={2.5} />
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-primary rotate-180 [writing-mode:vertical-rl]">
        Add agent
      </span>
    </button>
  );
}
