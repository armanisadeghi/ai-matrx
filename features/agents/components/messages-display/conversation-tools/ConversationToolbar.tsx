"use client";

/**
 * ConversationToolbar — the conversation-level answer tools, one quiet row
 * pinned to the top-right of a transcript:
 *
 *   Find (Cmd/Ctrl+F inside the transcript) · Pinned filter (only once
 *   something is pinned) · Export the whole conversation (MD / PDF / Word / HTML)
 *
 * Each control is present only when it can act. Export runs the same
 * `exportConversation` the registry's export actions run.
 */

import React from "react";
import { Download, Pin, Search } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  CONVERSATION_EXPORT_FORMATS,
  exportConversation,
} from "@/features/agents/conversation-export/export-conversation";
import { ConversationFindBar } from "./ConversationFindBar";
import type { FindHistoryState } from "./find-in-conversation";

const BTN =
  "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ConversationToolbar({
  conversationId,
  rootRef,
  findOpen,
  setFindOpen,
  findHistory,
  pinnedOnly,
  setPinnedOnly,
  pinnedCount,
}: {
  conversationId: string;
  rootRef: React.RefObject<HTMLElement | null>;
  findOpen: boolean;
  setFindOpen: (open: boolean) => void;
  findHistory: FindHistoryState;
  pinnedOnly: boolean;
  setPinnedOnly: (on: boolean) => void;
  pinnedCount: number;
}) {
  const dispatch = useAppDispatch();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div
      // Sticky chrome: above code blocks' floating controls (z-30 > their
      // z-20), which rest below it (`data-sticky-chrome`, verify-RC-B9 F5).
      className="sticky top-0 z-30 flex justify-end px-2 pt-1"
      data-sticky-chrome=""
      data-find-ignore=""
      aria-label="Conversation tools"
      role="toolbar"
    >
      {findOpen ? (
        <div className="w-full max-w-md">
          <ConversationFindBar rootRef={rootRef} history={findHistory} onClose={() => setFindOpen(false)} />
        </div>
      ) : (
        <div className="flex items-center gap-0.5 rounded-lg bg-background/80 backdrop-blur-sm">
          <button
            type="button"
            className={BTN}
            onClick={() => setFindOpen(true)}
            aria-label={`Find in conversation (${isMac ? "Cmd" : "Ctrl"}+F)`}
            title={`Find in conversation (${isMac ? "⌘" : "Ctrl+"}F)`}
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          {(pinnedCount > 0 || pinnedOnly) && (
            <button
              type="button"
              className={cn(BTN, pinnedOnly && "bg-amber-500/15 text-amber-700 dark:text-amber-300")}
              onClick={() => setPinnedOnly(!pinnedOnly)}
              aria-pressed={pinnedOnly}
              aria-label={pinnedOnly ? "Show all messages" : `Show only pinned messages (${pinnedCount})`}
              title={pinnedOnly ? "Show all messages" : "Show only pinned messages"}
            >
              <Pin className="h-3.5 w-3.5" />
              <span className="tabular-nums">{pinnedCount}</span>
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={BTN}
                aria-label="Export conversation"
                title="Export conversation"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Export whole conversation
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CONVERSATION_EXPORT_FORMATS.map(({ format, label }) => (
                <DropdownMenuItem
                  key={format}
                  onSelect={() => {
                    // A thunk hands the export a live getState without
                    // subscribing this toolbar to the whole store.
                    dispatch((d: AppDispatch, getState: () => RootState) => {
                      void exportConversation(d, getState, conversationId, format);
                    });
                  }}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
