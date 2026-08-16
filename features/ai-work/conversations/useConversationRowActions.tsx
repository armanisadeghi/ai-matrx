"use client";

// features/ai-work/conversations/useConversationRowActions.tsx
//
// The behaviour half of /work/conversations, bridged to the entity-list shell.
//
// There is exactly ONE conversation action list in this repo
// (`buildConversationMenu`), consumed identically by the chat sidebar, /code
// history, the agent-run sidebars and the floating windows. This surface
// consumes that same builder — three divergent hard-coded action lists for one
// entity is the defect the entity-list doctrine exists to kill.

import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { setConversationFavorite } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { isProviderSourceApp } from "@/features/ai-work/lib/providerSource";
import type { ConversationBrowseRow } from "./types";
import { applyAudience } from "./types";

/**
 * Where a conversation NATURALLY opens.
 *
 * An agentless provider mirror cannot run, so runnable chat is not its home;
 * an AI Matrx conversation's home is chat. The provenance view at
 * /work/conversations/[id] serves BOTH and is reachable from the row menu, so
 * neither kind is a dead end.
 */
export function conversationHomeHref(row: ConversationBrowseRow): string {
  return row.source_app && isProviderSourceApp(row.source_app)
    ? `/work/conversations/${row.id}`
    : `/chat/${row.id}`;
}

export function conversationProvenanceHref(row: ConversationBrowseRow): string {
  return `/work/conversations/${row.id}`;
}

export function useConversationRowActions(
  list: EntityListController<ConversationBrowseRow>,
): EntityRowActionsResult<ConversationBrowseRow> {
  const dispatch = useAppDispatch();
  const router = useRouter();

  // No manual memoization — the React Compiler owns it (CLAUDE.md).
  const menuFor = (row: ConversationBrowseRow) => () =>
    buildConversationMenu({
      conversationId: row.id,
      title: row.title,
      isFavorite: row.is_favorite,
      isArchived: row.is_archived,
      excludeFromKg: false,
      href: conversationHomeHref(row),
      showRename: false,
      showFavorite: row.is_owner,
      // A provider binding survives the conversation, so deleting the
      // conversation would leave the coding session pointing at nothing.
      showDelete: !row.provider,
      source: {
        app: row.source_app,
        feature: row.source_feature,
        originClass: row.origin_class,
        // Row-level pruning writes the SAME filter bag the header and the
        // audience control write — one vocabulary, three entry points.
        onShowOnly: row.source_app
          ? () =>
              list.setFilters({
                ...list.query.filters,
                source_app: { kind: "select", values: [row.source_app] },
              })
          : undefined,
        onHide: row.conversation_type
          ? () =>
              list.setFilters(
                applyAudience(
                  list.query.filters,
                  row.conversation_type === "subagent" ? "people" : "all",
                ),
              )
          : undefined,
      },
      onMutationSuccess: list.refresh,
      dispatch,
    });

  return {
    actions: {
      menuFor,
      onOpenRow: (row) => router.push(conversationHomeHref(row)),
      onToggleFavorite: (row) => {
        // Optimistic locally so the star responds now; the thunk owns the
        // write and its own revert.
        list.patchRow(row.id, { is_favorite: !row.is_favorite });
        void dispatch(
          setConversationFavorite({
            conversationId: row.id,
            isFavorite: !row.is_favorite,
          }),
        );
      },
    },
  };
}
