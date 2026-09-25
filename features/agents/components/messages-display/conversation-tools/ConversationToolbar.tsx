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
import { useAppStore } from "@/lib/redux/hooks";
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

const BTN =
  "inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ConversationToolbar({
  conversationId,
  rootRef,
  findOpen,
  setFindOpen,
  pinnedOnly,
  setPinnedOnly,
  pinnedCount,
}: {
  conversationId: string;
  rootRef: React.RefObject<HTMLElement | null>;
  findOpen: boolean;
  setFindOpen: (open: boolean) => void;
  pinnedOnly: boolean;
  setPinnedOnly: (on: boolean) => void;
  pinnedCount: number;
}) {
  const store = useAppStore();
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div
      className="sticky top-0 z-10 flex justify-end px-2 pt-1"
      data-find-ignore=""
      aria-label="Conversation tools"
      role="toolbar"
    >
      {findOpen ? (
        <div className="w-full max-w-md">
          <ConversationFindBar rootRef={rootRef} onClose={() => setFindOpen(false)} />
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
                    void exportConversation(store.getState, conversationId, format);
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
