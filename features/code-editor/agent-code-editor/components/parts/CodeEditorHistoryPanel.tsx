"use client";

/**
 * CodeEditorHistoryPanel — the leftmost column.
 *
 * Header: "Create for" agent dropdown + [+] button.
 * Body:   merged list of all conversations + drafts across the configured agents.
 *         Click a row → caller sets it active. Delete button on drafts only.
 *
 * This panel owns NO launch / conversation lifecycle. It just dispatches
 * callbacks up to `SmartCodeEditor`, which owns the widget handle + active id.
 */

import React from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { AppDispatch } from "@/lib/redux/store";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, MessageSquare, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useMergedAgentConversations,
  type MergedConversationRow,
} from "../../hooks/useMergedAgentConversations";
import type { CodeEditorAgentConfig } from "../../types";
import { ItemRow } from "@/components/official/item/ItemRow";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";

interface CodeEditorHistoryPanelProps {
  agents: CodeEditorAgentConfig[];
  /** Which agent the [+] button will create a draft for. */
  pickerAgentId: string;
  onPickerAgentChange: (agentId: string) => void;
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string, agentId: string) => void;
  onCreateDraft: (agentId: string) => void;
}

export function CodeEditorHistoryPanel({
  agents,
  pickerAgentId,
  onPickerAgentChange,
  activeConversationId,
  onSelectConversation,
  onCreateDraft,
}: CodeEditorHistoryPanelProps) {
  const dispatch = useAppDispatch();
  const agentIds = React.useMemo(() => agents.map((a) => a.id), [agents]);
  const { rows, status, errorMessages } = useMergedAgentConversations(agentIds);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background border-r border-border">
      {/* Header */}
      <div className="shrink-0 p-2 border-b border-border space-y-2">
        <Select value={pickerAgentId} onValueChange={onPickerAgentChange}>
          <SelectTrigger className="w-full h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id} className="text-xs">
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={() => onCreateDraft(pickerAgentId)}
          className="w-full h-8 gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {status === "loading" && rows.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {errorMessages.length > 0 && (
          <div className="px-3 py-2 text-[10px] text-destructive">
            {errorMessages[0]}
          </div>
        )}

        {status !== "loading" && rows.length === 0 && (
          <div className="px-3 pt-4 text-center">
            <p className="text-[10px] text-muted-foreground">
              No conversations yet. Click "New" to start.
            </p>
          </div>
        )}

        {rows.map((row) => {
          const isActive = row.conversationId === activeConversationId;
          if (row.isDraft) {
            return (
              <DraftRow
                key={row.conversationId}
                row={row}
                isActive={isActive}
                onSelect={() =>
                  onSelectConversation(row.conversationId, row.agentId)
                }
                onDelete={() =>
                  dispatch(destroyInstanceIfAllowed(row.conversationId))
                }
              />
            );
          }
          return (
            <ConversationItemRow
              key={row.conversationId}
              row={row}
              isActive={isActive}
              onSelect={() =>
                onSelectConversation(row.conversationId, row.agentId)
              }
              dispatch={dispatch}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Real (saved) conversation row — migrated to the ItemRow primitive. */
function ConversationItemRow({
  row,
  isActive,
  onSelect,
  dispatch,
}: {
  row: MergedConversationRow;
  isActive: boolean;
  onSelect: () => void;
  dispatch: AppDispatch;
}) {
  const date = row.sortKey
    ? new Date(row.sortKey).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;
  const href = `/agents/${row.agentId}/run?conversationId=${row.conversationId}`;
  const secondary = [
    `${row.messageCount} msg${row.messageCount === 1 ? "" : "s"}`,
    date,
    row.agentName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ItemRow
      className="mx-1"
      size="sm"
      label={row.title}
      secondaryLabel={secondary || undefined}
      active={isActive}
      onOpen={onSelect}
      menu={() =>
        buildConversationMenu({
          conversationId: row.conversationId,
          title: row.item?.title ?? row.title,
          isFavorite: row.item?.isFavorite ?? false,
          isArchived: row.item?.status === "archived",
          excludeFromKg: row.item?.excludeFromKg ?? false,
          isOwner: true,
          href,
          dispatch,
        })
      }
      rename={{
        value: row.item?.title ?? "",
        emptyFallback: "Untitled",
        onCommit: (next) =>
          void dispatch(
            renameConversation({
              conversationId: row.conversationId,
              title: next,
            }),
          ),
      }}
    />
  );
}

/** Local draft row — no server conversation; keeps its own delete control. */
function DraftRow({
  row,
  isActive,
  onSelect,
  onDelete,
}: {
  row: MergedConversationRow;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative border-b border-border/50 transition-colors",
        isActive ? "bg-primary/10" : "hover:bg-muted/50",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full px-3 py-2 text-left flex items-center gap-2"
      >
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-xs font-medium truncate italic text-muted-foreground",
              isActive && "text-primary",
            )}
          >
            {row.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <MessageSquare className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground">draft</span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className={cn(
          "absolute right-1.5 top-1/2 -translate-y-1/2 h-6 w-6",
          "flex items-center justify-center rounded hover:bg-destructive/10",
          "opacity-0 group-hover:opacity-100 transition-opacity",
        )}
        aria-label="Delete draft"
      >
        <Trash2 className="w-3 h-3 text-destructive" />
      </button>
    </div>
  );
}
