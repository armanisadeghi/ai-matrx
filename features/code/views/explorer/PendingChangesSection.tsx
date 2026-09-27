"use client";

/**
 * PendingChangesSection
 *
 * VSCode-/Cursor-style "Source Control" affordance for AI patches: a
 * collapsible header in the Explorer that lists every open tab the
 * agent has staged edits against. Clicking a row activates that tab —
 * which (because of `EditorArea`) auto-swaps from `<MonacoEditor>` to
 * `<TabDiffView>`. There is no separate review tab and no global
 * floating tray; the Explorer tells you *where* the pending edits are,
 * the file's own tab tells you *what* they are.
 *
 * Renders nothing when there are no pending patches, so it stays
 * out of the way during normal coding.
 */

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Lightbulb } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import {
  selectCodePatches,
  type PendingPatch,
} from "../../redux/codePatchesSlice";
import { selectCodeTabs, setActiveTab } from "../../redux/tabsSlice";
import { FileIcon } from "../../styles/file-icon";
import type { EditorFile } from "../../types";

interface PendingFileRow {
  tab: EditorFile;
  count: number;
}

export const PendingChangesSection: React.FC = () => {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(true);

  // Read both slices raw — the lists below are derived once per render
  // via `useMemo`, which is cheaper and clearer than building a custom
  // memoized selector for a dozen-or-fewer tabs.
  const byTabId = useAppSelector((s) => selectCodePatches(s).byTabId);
  const tabsById = useAppSelector((s) => selectCodeTabs(s).byId);
  const activeId = useAppSelector((s) => selectCodeTabs(s).activeId);

  const rows: PendingFileRow[] = useMemo(() => {
    const out: PendingFileRow[] = [];
    for (const tabId of Object.keys(byTabId)) {
      const tab = tabsById[tabId];
      if (!tab) continue;
      const patches: PendingPatch[] = byTabId[tabId] ?? [];
      const pending = patches.filter((p) => p.status === "pending").length;
      if (pending === 0) continue;
      out.push({ tab, count: pending });
    }
    out.sort((a, b) => a.tab.name.localeCompare(b.tab.name));
    return out;
  }, [byTabId, tabsById]);

  if (rows.length === 0) return null;

  const totalEdits = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <div className="shrink-0 border-b border-blue-200 bg-blue-50/40 dark:border-blue-900/60 dark:bg-blue-950/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] uppercase tracking-wide text-blue-900 hover:bg-blue-100/60 dark:text-blue-200 dark:hover:bg-blue-900/30"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <Lightbulb className="h-3 w-3" />
        <span className="font-medium">Pending Changes</span>
        <span className="ml-auto rounded bg-blue-600 px-1.5 py-[1px] text-[10px] font-semibold text-white">
          {/* read-gate-exempt: patches staged in memory from the agent's SEARCH/REPLACE output (codePatchesSlice), never fetched */}
          {rows.length} {rows.length === 1 ? "file" : "files"} · {totalEdits}{" "}
          {totalEdits === 1 ? "edit" : "edits"}
        </span>
      </button>

      {open && (
        <ul className="flex flex-col py-0.5">
          {rows.map(({ tab, count }) => {
            const isActive = tab.id === activeId;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => dispatch(setActiveTab(tab.id))}
                  title={tab.path}
                  className={cn(
                    "flex w-full items-center gap-1.5 px-2 py-[3px] text-left text-[12px]",
                    isActive
                      ? "bg-blue-100 text-blue-950 dark:bg-blue-900/50 dark:text-blue-50"
                      : "text-neutral-800 hover:bg-blue-100/60 dark:text-neutral-200 dark:hover:bg-blue-900/30",
                  )}
                >
                  <FileIcon name={tab.name} size={12} />
                  <span className="truncate font-mono">{tab.name}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                    {tab.path}
                  </span>
                  <span className="ml-1 shrink-0 rounded bg-blue-600/90 px-1 py-[1px] text-[10px] font-semibold text-white">
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
