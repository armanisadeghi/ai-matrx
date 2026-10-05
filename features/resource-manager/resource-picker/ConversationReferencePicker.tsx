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

import { useEffect, useState } from "react";
import { Loader2, MessagesSquare } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectAgentById } from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import type { RootState } from "@/lib/redux/store";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { usePickerInputFocus } from "./usePickerInputFocus";
import {
  PickerEmpty,
  PickerRow,
  PickerSearchField,
  PickerView,
  PickerViewBody,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { conversationTitleText } from "@/features/content-ir/surfaces/kind-text-label";

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
  const title = conversationTitleText(conversation.title?.trim() || null) || "Untitled chat";
  return `my conversation "${title}" (conversation ${conversation.id})`;
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
    <div className="group flex items-center gap-1 pr-1">
      <div className="min-w-0 flex-1">
        <PickerRow
          icon={MessagesSquare}
          iconClassName="text-emerald-600 dark:text-emerald-400"
          label={conversationTitleText(row.title?.trim() || null) || "Untitled chat"}
          secondary={
            `${formatRelativeTime(row.updatedAt, { fallback: "" })}${agentName ? ` · ${agentName}` : ""}` ||
            undefined
          }
          onClick={() => onSelect(row)}
        />
      </div>
      {/* Door Law: the chat this row names stays reachable without losing the
          draft the user is composing — new tab / peek only. */}
      <EntityDoorControls
        token="conversation"
        id={row.id}
        name={row.title}
        size="md"
        revealOnHover
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

  useEffect(() => {
    const signal = { cancelled: false };
    const load = async (query: string) => {
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
    };
    const timer = setTimeout(() => void load(trimmedSearch), 200);
    return () => {
      signal.cancelled = true;
      clearTimeout(timer);
    };
  }, [userId, currentConversationId, trimmedSearch]);

  const renderBody = () => {
    if (!userId) {
      return <PickerEmpty>Sign in to reference your own chats.</PickerEmpty>;
    }
    if (error) {
      return (
        <div className="px-3 py-10 text-center text-sm text-destructive">
          Couldn&apos;t load your chats: {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      );
    }
    if (rows === null) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }
    if (rows.length === 0) {
      return (
        <PickerEmpty>
          {trimmedSearch
            ? `No chats of yours match “${trimmedSearch}”.`
            : "You don't have any other chats yet — start one from Chat and it will show up here."}
        </PickerEmpty>
      );
    }
    return rows.map((row) => (
      <ConversationRow key={row.id} row={row} onSelect={onSelect} />
    ));
  };

  return (
    <PickerView>
      <ResourcePickerSubViewHeader
        onBack={onBack}
        search={
          <PickerSearchField
            ref={searchInputRef}
            placeholder="Search your chats"
            value={search}
            onChange={setSearch}
          />
        }
      />
      <PickerViewBody>{renderBody()}</PickerViewBody>
    </PickerView>
  );
}
