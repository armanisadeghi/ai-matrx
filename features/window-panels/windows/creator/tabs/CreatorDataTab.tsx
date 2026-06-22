"use client";

import { Trash2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectCreatorDebugData,
  clearCreatorDebugData,
} from "@/lib/redux/preferences/creatorDebugSlice";
import PageDebugDisplay from "@/components/admin/debug/PageDebugDisplay";

/**
 * Renders the creator debug bag (state.creatorDebug.debugData). Any feature
 * can drop data here via dispatch(setCreatorDebugKey({ key, value })) without
 * its own slice — this tab is the single read surface for all of it.
 */
export default function CreatorDataTab() {
  const dispatch = useAppDispatch();
  const debugData = useAppSelector(selectCreatorDebugData);
  const hasData = Object.keys(debugData).length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-foreground">
            Creator Data
          </span>
          <span className="text-[11px] text-muted-foreground">
            Arbitrary debug data, keyed by &quot;Namespace:Label&quot;
          </span>
        </div>
        <button
          type="button"
          onClick={() => dispatch(clearCreatorDebugData())}
          disabled={!hasData}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          title="Clear all creator debug data"
        >
          <Trash2 className="h-3 w-3" />
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <PageDebugDisplay debugData={debugData} />
      </div>
    </div>
  );
}
