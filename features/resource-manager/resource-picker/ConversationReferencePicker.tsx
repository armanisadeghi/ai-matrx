"use client";

/**
 * ConversationReferencePicker — "reference one of my chats" in the composer.
 *
 * NOT an attachment: picking a conversation inserts a readable mention into
 * the draft — `my conversation "Q3 pricing" (conversation <uuid>)` — so the
 * agent receives the id unambiguously (it feeds `agent_call`'s
 * `history_conversation_id`) while the user never types or reads a raw UUID.
 * The parenthetical is the compact machine half of one human sentence; it is
 * deliberately inline text rather than a chip, because the model reads the
 * message, not our attachment metadata.
 *
 * Scope (THE VIEW LAW — the list declares its own scope, never a bare
 * RLS-filtered read): the signed-in user's OWN conversations, `standard`
 * type only (subagent / workflow threads are machinery, not something a
 * person means by "my chat"), not deleted, not ephemeral, recency-first.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessagesSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import type { RootState } from "@/lib/redux/store";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { usePickerInputFocus } from "./usePickerInputFocus";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

export interface ConversationReferenceRow {
  id: string;
  title: string | null;
  updatedAt: string;
  agentId: string | null;
}

interface ConversationReferencePickerProps {
  onBack: () => void;
  onSelect: (conversation: ConversationReferenceRow) => void;
  /** The conversation the composer belongs to — excluded from the list. */
  currentConversationId?: string;
}

const PAGE_SIZE = 40;

/** The one place the mention's wording lives — shared with any future inserter. */
export function formatConversationReference(
  conversation: ConversationReferenceRow,
): string {
  const title = conversation.title?.trim() || "Untitled chat";
  return `my conversation "${title}" (conversation ${conversation.id})`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ConversationRow({
  row,
  onSelect,
}: {
  row: ConversationReferenceRow;
  onSelect: (row: ConversationReferenceRow) => void;
}) {
  const agentName = useAppSelector((s: RootState) =>
    row.agentId ? (selectAgentById(s, row.agentId)?.name ?? null) : null,
  );

  return (
    <div className="group flex items-center gap-1 rounded px-1 hover:bg-muted/60">
      <button
        type="button"
        onClick={() => onSelect(row)}
        className="min-w-0 flex-1 rounded px-1 py-1.5 text-left"
      >
        <div className="truncate text-xs font-medium text-foreground">
          {row.title?.trim() || "Untitled chat"}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {relativeTime(row.updatedAt)}
          {agentName ? ` · ${agentName}` : ""}
        </div>
      </button>
      {/* Door Law: the chat this row names stays reachable without losing the
          draft the user is composing — new tab / peek only. */}
      <EntityDoorControls
        token="conversation"
        id={row.id}
        name={row.title}
        className="shrink-0"
      />
    </div>
  );
}

export function ConversationReferencePicker({
  onBack,
  onSelect,
  currentConversationId,
}: ConversationReferencePickerProps) {
  const searchInputRef = usePickerInputFocus();
  const userId = useAppSelector(selectUserId);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ConversationReferenceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmedSearch = search.trim();

  const load = useCallback(
    async (query: string, signal: { cancelled: boolean }) => {
      if (!userId) return;
      setError(null);
      let request = supabase
        .schema("chat")
        .from("conversation")
        .select("id, title, updated_at, initial_agent_id")
        // Scope declared explicitly — mine, real chats, alive.
        .eq("created_by", userId)
        .eq("conversation_type", "standard")
        .eq("is_ephemeral", false)
        .is("deleted_at", null);
      if (query) request = request.ilike("title", `%${query}%`);
      const { data, error: queryError } = await request
        .order("updated_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (signal.cancelled) return;
      if (queryError) {
        setError(queryError.message);
        setRows([]);
        return;
      }
      setRows(
        (data ?? [])
          .filter((row) => row.id !== currentConversationId)
          .map((row) => ({
            id: row.id as string,
            title: (row.title ?? null) as string | null,
            updatedAt: row.updated_at as string,
            agentId: (row.initial_agent_id ?? null) as string | null,
          })),
      );
    },
    [userId, currentConversationId],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    const timer = setTimeout(() => void load(trimmedSearch, signal), 200);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [load, trimmedSearch]);

  const body = useMemo(() => {
    if (!userId) {
      return (
        <div className="px-3 py-8 text-center text-xs text-muted-foreground">
          Sign in to reference your own chats.
        </div>
      );
    }
    if (error) {
      return (
        <div className="px-3 py-8 text-center text-xs text-destructive">
          Couldn&apos;t load your chats: {error}
        </div>
      );
    }
    if (rows === null) {
      return (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <div className="px-3 py-8 text-center text-xs text-muted-foreground">
          {trimmedSearch
            ? `No chats of yours match “${trimmedSearch}”.`
            : "You don't have any other chats yet — start one from Chat and it will show up here."}
        </div>
      );
    }
    return (
      <div className="space-y-0.5 p-1">
        {rows.map((row) => (
          <ConversationRow key={row.id} row={row} onSelect={onSelect} />
        ))}
      </div>
    );
  }, [userId, error, rows, trimmedSearch, onSelect]);

  return (
    <div className="flex max-h-[460px] flex-col">
      <ResourcePickerSubViewHeader
        title="Reference a chat"
        icon={
          <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        }
        onBack={onBack}
      />
      <div className="border-b border-border px-2 py-1.5">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            type="text"
            placeholder="Search your chats by title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 border-border bg-background pl-7 pr-2 text-xs"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {body}
      </div>
    </div>
  );
}
