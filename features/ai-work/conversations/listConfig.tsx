"use client";

// features/ai-work/conversations/listConfig.tsx
//
// /work/conversations expressed as an entity-list config — the canonical shell
// (lib/entity-list), the same one /agents/all and /transcripts run on. Nothing
// bespoke: the surface supplies its service triple, its column registry, its
// scopes and its row actions; the shell owns tabs with true server counts,
// search, the Filters & Sort panel, the column picker, the controlled
// MatrxDataTable, view/density persistence and inline edit.
//
// Two things this surface asks of the shell that no earlier consumer needed,
// both generic and both now part of the contract:
//   * `defaultFilters` — the honest default is a SUBSET (see ./types.ts).
//   * `urlState`       — scope/search/filters/sort/page belong in the URL.

import type {
  EntityListConfig,
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { relativeTime } from "@/lib/entity-list/columns";
import { CONVERSATION_COLUMNS } from "./columns";
import {
  fetchConversationFacets,
  fetchConversationPage,
  fetchConversationScopeCounts,
  saveConversationTitle,
} from "./service";
import {
  conversationTypeLabel,
  originClassLabel,
  providerLabel,
} from "./presentation";
import { appLabel } from "@/features/agents/redux/conversation-history/source-registry";
import {
  conversationHomeHref,
  useConversationRowActions,
} from "./useConversationRowActions";
import {
  CONVERSATION_LIST_SCOPES,
  DEFAULT_CONVERSATION_FILTERS,
  type ConversationBrowseRow,
} from "./types";

function useRowActions(
  list: EntityListController<ConversationBrowseRow>,
): EntityRowActionsResult<ConversationBrowseRow> {
  return useConversationRowActions(list);
}

export const conversationListConfig: EntityListConfig<ConversationBrowseRow> = {
  surfaceKey: "ai-work-conversations",
  entityLabel: { singular: "conversation", plural: "conversations" },
  scopes: CONVERSATION_LIST_SCOPES,
  service: {
    fetchPage: fetchConversationPage,
    fetchCounts: fetchConversationScopeCounts,
    fetchFacets: fetchConversationFacets,
  },
  columns: CONVERSATION_COLUMNS,
  // Bump whenever CONVERSATION_COLUMNS gains or loses a column.
  // v2: `last_activity` replaced `updated` as the visible activity column, and
  // `updated` became the hidden "Last modified".
  prefsVersion: 2,
  // The default sort is the HONEST activity stamp, not the row-mutation stamp.
  // Declaring it here also retires every stored `sort: "updated"` on the v1
  // shape (lib/list-views/defaults.ts) — otherwise the surface would ship the
  // fix and every existing user would keep the meaningless order.
  prefsDefaults: { sort: "last_activity", direction: "desc" },
  getRowId: (row) => row.id,
  getRowName: (row) => row.title?.trim() || "Untitled conversation",
  // THE DOOR LAW: the title cell is a real anchor. A provider mirror is
  // agentless and cannot run, so its home is the read-only transcript; an AI
  // Matrx conversation's home is chat.
  door: { token: "conversation", hrefFor: conversationHomeHref },
  sourceFeature: "chat",
  getRowEntity: (row) => ({
    type: "conversation",
    id: row.id,
    title: row.title?.trim() || "Untitled conversation",
  }),
  defaultFilters: DEFAULT_CONVERSATION_FILTERS,
  urlState: true,
  useRowActions,
  favorite: {
    isFavorite: (row) => row.is_favorite,
    canToggle: (row) => row.is_owner,
    disabledTitle: "Shared conversations can't be favorited",
  },
  edit: {
    save: (row, edit) =>
      saveConversationTitle(row.id, String(edit.title ?? "")),
  },
  deepSearch: { label: "Also search inside messages" },
  facetSections: [
    {
      facet: "conversation_type",
      filterId: "conversation_type",
      label: "Type",
      noneLabel: "Untyped",
      formatValue: conversationTypeLabel,
      searchPlaceholder: "Find type…",
    },
    {
      facet: "source_app",
      filterId: "source_app",
      label: "App",
      noneLabel: "No app recorded",
      formatValue: appLabel,
      searchPlaceholder: "Find app…",
    },
    {
      facet: "workspace_name",
      filterId: "workspace_name",
      label: "Workspaces",
      noneLabel: "No workspace",
      minOptions: 2,
      searchPlaceholder: "Find workspace…",
    },
    {
      facet: "provider",
      filterId: "provider",
      label: "Provider",
      noneLabel: "AI Matrx only",
      formatValue: (value) => providerLabel(value) ?? value,
      minOptions: 2,
      countInLabel: false,
      searchPlaceholder: "Find provider…",
    },
    {
      facet: "origin_class",
      filterId: "origin_class",
      label: "Origin",
      noneLabel: "Not recorded",
      formatValue: originClassLabel,
      minOptions: 2,
      searchPlaceholder: "Find origin…",
    },
  ],
  noneLabels: {
    source_app: "No app recorded",
    source_feature: "No feature recorded",
    provider: "AI Matrx only",
    workspace_name: "No workspace",
    provider_account: "No account reported",
    title_source: "AI Matrx title",
    fidelity: "No binding",
    binding_status: "No binding",
    owner_email: "No account",
    organization_name: "No organization",
  },
  copy: {
    label: "Conversation",
    listLabel: "Conversations",
    location: "/work/conversations",
    rowKind: "conversation",
    listKind: "conversation-list",
    humanRow: (row) =>
      `${row.title?.trim() || "Untitled conversation"} — ${conversationTypeLabel(
        row.conversation_type,
      )}${row.workspace_name ? ` in ${row.workspace_name}` : ""}, ${
        row.message_count
      } messages, last active ${relativeTime(row.last_activity_at)}`,
    showRow: false,
    showToolbar: true,
  },
  emptyState: {
    title: "No conversations here",
    description:
      "Nothing matches this scope and filter combination. Internal machine runs are excluded by default — the switch above includes them.",
  },
};
