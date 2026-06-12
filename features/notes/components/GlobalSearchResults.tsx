"use client";

// GlobalSearchResults — Renders the cross-note results of the find bar when
// `scope === "global"`. Mirrors VS Code's left-rail search panel:
//   - Header summary ("N results in M files")
//   - Groups by folder/note, collapsible
//   - Each row shows the matching line with the hit substring highlighted
//   - Click a row → activates that note's tab AND queues a jump to that
//     specific match (consumed by useFindReplace once the matches for the
//     newly-active note have been computed).
//
// This component is intentionally dumb — it owns no state of its own. All
// computation lives in `useGlobalFind`; all interactions are dispatched
// through Redux so the active-match-on-click flow survives tab switches
// and remount.

import React, { useCallback, useState, useMemo } from "react";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  addInstanceTab,
  setInstanceActiveTab,
  markTabInteraction,
  requestActiveMatch,
} from "../redux/slice";
import { useGlobalFind } from "../hooks/useGlobalFind";
import type {
  GlobalMatchHit,
  GlobalSearchNoteResult,
} from "../utils/findMatches";

interface GlobalSearchResultsProps {
  instanceId: string;
  className?: string;
}

export function GlobalSearchResults({
  instanceId,
  className,
}: GlobalSearchResultsProps) {
  const dispatch = useAppDispatch();
  const { results, totalMatches, matchedNotes, searchedNotes } =
    useGlobalFind(instanceId);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleCollapsed = useCallback((noteId: string) => {
    setCollapsed((c) => ({ ...c, [noteId]: !c[noteId] }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Keep focus in the find input — clicking a result must not steal
    // focus, otherwise typing afterwards goes nowhere and the previously
    // shipped "Ctrl+F re-focus" fix would feel broken. preventDefault on
    // mousedown is the only point in the event lifecycle that suppresses
    // the focus shift before the click handler runs.
    e.preventDefault();
  }, []);

  const handleHitClick = useCallback(
    (noteId: string, hit: GlobalMatchHit) => {
      // Order matters: queue the pending match BEFORE the tab switch.
      // useFindReplace's effect runs when the newly-active note's matches
      // are computed; the pending field tells it which one to land on.
      dispatch(
        requestActiveMatch({
          instanceId,
          noteId,
          matchIndex: hit.indexInNote,
        }),
      );
      dispatch(addInstanceTab({ instanceId, noteId }));
      dispatch(markTabInteraction({ instanceId }));
      dispatch(setInstanceActiveTab({ instanceId, noteId }));
    },
    [dispatch, instanceId],
  );

  // Group consecutive results by folder for the section headers.
  const folderGroups = useMemo(() => {
    const groups: { folder: string; notes: GlobalSearchNoteResult[] }[] = [];
    for (const r of results) {
      const last = groups[groups.length - 1];
      if (last && last.folder === r.folder) {
        last.notes.push(r);
      } else {
        groups.push({ folder: r.folder, notes: [r] });
      }
    }
    return groups;
  }, [results]);

  if (results.length === 0) {
    return (
      <div
        className={cn(
          "px-3 py-2 text-xs text-muted-foreground border-b border-border bg-muted/10",
          className,
        )}
      >
        {searchedNotes === 0
          ? "No notes match the path filter."
          : "No results in the searched notes."}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col min-h-0 border-b border-border bg-muted/10",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-1 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border/60 shrink-0">
        <span>
          {totalMatches} {totalMatches === 1 ? "result" : "results"} in{" "}
          {matchedNotes} {matchedNotes === 1 ? "note" : "notes"}
        </span>
        <span className="tabular-nums">{searchedNotes} searched</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1 max-h-[40dvh]">
        {folderGroups.map((group) => (
          <div key={group.folder || "__unfiled__"} className="mb-1">
            <div className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Folder className="w-3 h-3" />
              <span className="truncate">{group.folder || "(unfiled)"}</span>
            </div>
            {group.notes.map((note) => {
              const isCollapsed = collapsed[note.noteId];
              return (
                <div key={note.noteId} className="mb-0.5">
                  <button
                    type="button"
                    onMouseDown={handleMouseDown}
                    onClick={() => toggleCollapsed(note.noteId)}
                    className="w-full flex items-center gap-1 px-2 py-0.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-3 h-3 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    )}
                    <FileText className="w-3 h-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{note.label}</span>
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {note.hits.length}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <ul className="pl-7">
                      {note.hits.map((hit) => (
                        <li key={hit.start}>
                          <button
                            type="button"
                            onMouseDown={handleMouseDown}
                            onClick={() => handleHitClick(note.noteId, hit)}
                            className="w-full text-left px-2 py-0.5 text-xs font-mono text-muted-foreground hover:bg-primary/10 hover:text-foreground rounded-sm transition-colors flex items-baseline gap-2"
                            title={`Line ${hit.line + 1}, col ${hit.columnStart + 1}`}
                          >
                            <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0 w-8 text-right">
                              {hit.line + 1}
                            </span>
                            <span className="truncate">
                              {hit.lineText.slice(0, hit.columnStart)}
                              <mark className="bg-yellow-200 dark:bg-yellow-700/60 text-foreground rounded-sm">
                                {hit.lineText.slice(
                                  hit.columnStart,
                                  hit.columnEnd,
                                )}
                              </mark>
                              {hit.lineText.slice(hit.columnEnd)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
