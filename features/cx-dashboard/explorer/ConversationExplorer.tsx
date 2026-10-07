"use client";

// THE ADMIN CONVERSATION EXPLORER — every conversation on the platform, found by the facts an
// admin actually has: a person's name or email, their organization, the agent, the model, how
// much it cost or how many tokens it used, where it came from, when. Every search, filter, sort
// and page is a DATABASE query (`chat.admin_explore_conversations`); nothing here filters rows the
// browser happens to hold. Service + filter mapping: ./service.ts.

import { useEffect, useRef, useState } from "react";
import { GitBranch, MessageSquare } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@ai-matrx/design-system/data-table/types";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { useOpenAgentFromChatWindow } from "@/features/overlays/openers/agentFromChatWindow";
import { formatRelativeTime } from "@/features/cx-dashboard/utils/format";
import {
  EMPTY_FACETS,
  exploreConversationFacets,
  exploreConversations,
  type ExplorerConversation,
  type ExplorerFacets,
  type FacetOption,
} from "./service";
import { formatCount, formatUsd } from "@ai-matrx/kit/format";

const detailHref = (id: string) => `/administration/chat/cx-dashboard/conversations/${id}`;

const INITIAL_STATE: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 50,
  search: "",
  anyOf: "",
  columnFilters: {},
  sort: { id: "updated_at", direction: "desc" },
};

function options(list: FacetOption[]) {
  return list.map((o) => ({
    value: o.value,
    label: `${o.label}${o.hint && o.hint !== o.label ? ` · ${o.hint}` : ""} (${o.count})`,
  }));
}

// Admin surface: dollars, at the price voice so a sub-cent conversation reads its real cost.
const money = (n: number) => (n === 0 ? "—" : formatUsd(n, { digits: "trim" }));
const compact = (n: number) => (n === 0 ? "—" : formatCount(n, { style: "compact" }));

function columnsFor(facets: ExplorerFacets): MatrxColumnDef<ExplorerConversation>[] {
  return [
    {
      id: "title",
      header: "Conversation",
      accessorFn: (r) => r.title ?? "",
      filter: "text",
      href: (r) => detailHref(r.id),
      width: 280,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          {r.parent_conversation_id ? (
            <GitBranch className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : null}
          <span className="truncate font-medium">
            {r.title || <span className="italic text-muted-foreground">Untitled</span>}
          </span>
        </span>
      ),
    },
    {
      id: "owner",
      header: "Person",
      accessorFn: (r) => r.owner_label ?? "",
      filter: "select",
      filterOptions: options(facets.owners),
      width: 200,
      cell: (r) => (
        <div className="min-w-0 leading-tight">
          <p className="truncate type-secondary">{r.owner_label ?? "—"}</p>
          {r.owner_email && r.owner_email !== r.owner_label ? (
            <p className="truncate type-meta text-muted-foreground">{r.owner_email}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "organization",
      header: "Organization",
      accessorFn: (r) => r.organization_name ?? "",
      filter: "select",
      filterOptions: options(facets.organizations),
      width: 170,
    },
    {
      id: "agent",
      header: "Agent",
      accessorFn: (r) => r.agent_name ?? "",
      filter: "select",
      filterOptions: options(facets.agents),
      width: 180,
    },
    {
      id: "model",
      header: "Models",
      accessorFn: (r) => (r.model_names.length ? r.model_names.join(", ") : (r.last_model_name ?? "")),
      filter: "select",
      filterOptions: options(facets.models),
      width: 170,
    },
    {
      id: "message_count",
      accessorKey: "message_count",
      header: "Messages",
      filter: "number",
      align: "right",
      width: 100,
      cell: (r) => (
        <span className="inline-flex items-center gap-1 type-secondary">
          <MessageSquare className="h-3 w-3 text-muted-foreground" />
          {r.message_count}
        </span>
      ),
    },
    {
      id: "request_count",
      accessorKey: "request_count",
      header: "Requests",
      filter: "number",
      align: "right",
      width: 95,
    },
    {
      id: "total_tokens",
      accessorKey: "total_tokens",
      header: "Tokens",
      filter: "number",
      align: "right",
      width: 95,
      cell: (r) => <span className="type-secondary tabular-nums">{compact(r.total_tokens)}</span>,
    },
    {
      id: "total_cost",
      accessorKey: "total_cost",
      header: "Cost",
      filter: "number",
      align: "right",
      width: 90,
      cell: (r) => <span className="type-secondary tabular-nums">{money(r.total_cost)}</span>,
    },
    {
      id: "source_app",
      accessorKey: "source_app",
      header: "App",
      filter: "select",
      filterOptions: options(facets.source_apps),
      width: 130,
    },
    {
      id: "source_feature",
      accessorKey: "source_feature",
      header: "Feature",
      filter: "select",
      filterOptions: options(facets.source_features),
      width: 140,
      hidden: true,
    },
    {
      id: "origin_class",
      accessorKey: "origin_class",
      header: "Origin",
      filter: "select",
      filterOptions: options(facets.origin_classes),
      width: 110,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: options(facets.statuses),
      width: 95,
      hidden: true,
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: "date",
      width: 115,
      cell: (r) => (
        <span className="whitespace-nowrap type-secondary text-muted-foreground">
          {formatRelativeTime(r.created_at)}
        </span>
      ),
    },
    {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Last active",
      filter: "date",
      width: 115,
      cell: (r) => (
        <span className="whitespace-nowrap type-secondary text-muted-foreground">
          {formatRelativeTime(r.updated_at)}
        </span>
      ),
    },
    {
      id: "id",
      accessorKey: "id",
      header: "ID",
      cellKind: "uuid",
      // The toolbar search matches an exact conversation id, so the column itself has nothing to filter.
      filter: false,
      sortable: false,
      width: 110,
      hidden: true,
    },
  ];
}

export function ConversationExplorer() {
  const openMakeAgent = useOpenAgentFromChatWindow();
  const [query, setQuery] = useState<MatrxDataTableQueryState>(INITIAL_STATE);
  const [rows, setRows] = useState<ExplorerConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<ExplorerFacets>(EMPTY_FACETS);
  const [reload, setReload] = useState(0);
  // Only the newest query's answer may land: a slow broad query must never overwrite a fast narrow one.
  const latest = useRef(0);

  useEffect(() => {
    void exploreConversationFacets()
      .then(setFacets)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Filter choices could not be loaded."));
  }, [reload]);

  useEffect(() => {
    const ticket = ++latest.current;
    setLoading(true);
    exploreConversations(query, false)
      .then((answer) => {
        if (ticket !== latest.current) return;
        setRows(answer.rows);
        setTotal(answer.total);
        setError(null);
      })
      .catch((e: unknown) => {
        if (ticket !== latest.current) return;
        setError(e instanceof Error ? e.message : "Conversations could not be loaded.");
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });
  }, [query, reload]);

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columnsFor(facets)}
          getRowId={(r) => r.id}
          isLoading={loading && rows.length === 0}
          isFetching={loading && rows.length > 0}
          read={{
            status: error ? "error" : loading && rows.length === 0 ? "loading" : "ready",
            error: error ?? undefined,
            onRetry: () => setReload((n) => n + 1),
            what: "conversations",
          }}
          emptyState={{ title: "No conversations match" }}
          query={{
            mode: "controlled",
            state: query,
            totalItems: total,
            onStateChange: setQuery,
            sourceProcessing: { search: "source", columnFilters: "source", sort: "source", sourceTotal: total },
          }}
          toolbar={{
            title: "Conversations",
            refresh: { onRefresh: () => setReload((n) => n + 1) },
            search: true,
            searchPlaceholder: "Search people, emails, organizations, agents, titles or an id…",
          }}
          rowActions={(r) => [
            {
              id: "make-agent",
              icon: AGENT_ICON,
              label: "Make an agent",
              tooltip: "Build an agent from this chat for its owner",
              onClick: () => openMakeAgent({ conversationId: r.id, conversationTitle: r.title }),
            },
          ]}
          copy={{
            label: "Conversation",
            listLabel: "Conversations (this view)",
            location: "/administration/chat/cx-dashboard/conversations",
            rowKind: "cx-conversation",
            listKind: "cx-conversations",
            humanRow: (r) =>
              [
                `Title: ${r.title ?? "Untitled"}`,
                `Person: ${r.owner_label ?? "—"}${r.owner_email ? ` <${r.owner_email}>` : ""}`,
                `Organization: ${r.organization_name ?? "—"}`,
                `Agent: ${r.agent_name ?? "—"}`,
                `Models: ${r.model_names.join(", ") || "—"}`,
                `Messages: ${r.message_count} · Requests: ${r.request_count}`,
                `Tokens: ${formatCount(r.total_tokens)} · Cost: ${formatUsd(r.total_cost, { digits: "trim" })}`,
                `Created: ${r.created_at}`,
              ].join("\n"),
            rowAttributes: (r) => ({ id: r.id }),
          }}
        />
      </div>
    </div>
  );
}
