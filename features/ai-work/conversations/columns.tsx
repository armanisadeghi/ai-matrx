"use client";

// features/ai-work/conversations/columns.tsx
//
// EVERY column /work/conversations can show, declared once.
//
// APP POLICY: every column sorts AND filters, server-side, over the whole
// result set — all of it served by `cvx_list_scoped` / `cvx_list_facets`
// (migrations/cvx_list_scoped.sql). Finite value sets get real OPTIONS with
// counts, never a bare text box; `message_count` filters by SIZE BAND because
// nobody looks for "exactly 37 messages"; dates filter by recency bucket.
//
// The spec shape and the shared cell helpers live in lib/entity-list/columns.

import { Archive, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  DATE_FILTER_OPTIONS,
  Muted,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { appLabel } from "@/features/agents/redux/conversation-history/source-registry";
import { fidelityVerdict } from "@/features/agent-connections/coding-sessions/verdict";
import { formatText } from "@/utils/text/text-case-converter";
import {
  conversationTypeLabel,
  originClassLabel,
  providerLabel,
  titleProvenance,
} from "./presentation";
import type { ConversationBrowseRow } from "./types";

/** Size bands must match `public.cvx_size_band` exactly. */
export const MESSAGE_COUNT_FILTER_OPTIONS = [
  { value: "empty", label: "No messages" },
  { value: "1-5", label: "1–5 messages" },
  { value: "6-20", label: "6–20 messages" },
  { value: "21-100", label: "21–100 messages" },
  { value: "100+", label: "Over 100 messages" },
];

export const CONVERSATION_COLUMNS: EntityColumnSpec<ConversationBrowseRow>[] = [
  {
    id: "favorite",
    label: "Favorite",
    facet: "favorite",
    locked: true,
    column: {
      id: "favorite",
      accessorKey: "is_favorite",
      header: <Star className="mx-auto h-3.5 w-3.5" aria-label="Favorite" />,
      filter: "boolean",
      width: 40,
      align: "center",
      // The interactive star is injected by EntityListTable, which owns the
      // toggle handler.
    },
  },
  {
    id: "title",
    label: "Title",
    locked: true,
    column: {
      id: "title",
      accessorKey: "title",
      header: "Title",
      filter: "text",
      editable: "string",
      editTrigger: "pencil",
      width: 420,
      className: "max-w-[26rem] overflow-hidden",
      cell: (row) => {
        const provenance = titleProvenance(row.title_source, row.provider);
        return (
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="truncate font-medium"
              title={row.title ?? undefined}
            >
              {row.title?.trim() || "Untitled conversation"}
            </span>
            {/* Never let a derived title pass as the provider's own label.
                Only the provider-supplied case earns a chip — an "AI Matrx
                title" badge on every single row would be the same wasted
                space as the old per-row Subagent pill. */}
            {provenance.fromProvider && (
              <Badge
                variant="secondary"
                className="shrink-0 py-0 text-[10px] font-normal"
                title={provenance.detail}
              >
                {provenance.chip}
              </Badge>
            )}
            {row.is_archived && (
              <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
                <Archive className="mr-1 h-2.5 w-2.5" />
                Archived
              </Badge>
            )}
          </div>
        );
      },
    },
  },
  {
    id: "conversation_type",
    label: "Type",
    facet: "conversation_type",
    formatFacetValue: conversationTypeLabel,
    column: {
      id: "conversation_type",
      accessorKey: "conversation_type",
      header: "Type",
      filter: "select",
      width: 130,
      cell: (row) => (
        <span className="truncate text-muted-foreground">
          {conversationTypeLabel(row.conversation_type)}
        </span>
      ),
    },
  },
  {
    id: "source_app",
    label: "App",
    facet: "source_app",
    formatFacetValue: appLabel,
    column: {
      id: "source_app",
      accessorKey: "source_app",
      header: "App",
      filter: "select",
      width: 140,
      cell: (row) =>
        row.source_app ? (
          <span className="truncate">{appLabel(row.source_app)}</span>
        ) : (
          <Muted>Not recorded</Muted>
        ),
    },
  },
  {
    id: "provider",
    label: "Provider",
    facet: "provider",
    formatFacetValue: (value) => providerLabel(value) ?? value,
    column: {
      id: "provider",
      accessorKey: "provider",
      header: "Provider",
      filter: "select",
      width: 130,
      cell: (row) =>
        row.provider ? (
          <span className="truncate">{providerLabel(row.provider)}</span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "workspace_name",
    label: "Workspace",
    facet: "workspace_name",
    column: {
      id: "workspace_name",
      accessorKey: "workspace_name",
      header: "Workspace",
      filter: "select",
      width: 160,
      cell: (row) =>
        row.workspace_name ? (
          <span className="truncate" title={row.workspace_name}>
            {row.workspace_name}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "message_count",
    label: "Messages",
    facet: "message_count",
    column: {
      id: "message_count",
      accessorKey: "message_count",
      header: "Msgs",
      filter: "select",
      filterOptions: MESSAGE_COUNT_FILTER_OPTIONS,
      width: 80,
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {row.message_count}
        </span>
      ),
    },
  },
  {
    id: "updated",
    label: "Last activity",
    column: {
      id: "updated",
      accessorKey: "updated_at",
      header: "Last activity",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 130,
      align: "right",
      cell: (row) => timeCell(row.updated_at),
    },
  },
  {
    id: "origin_class",
    label: "Origin",
    facet: "origin_class",
    formatFacetValue: originClassLabel,
    column: {
      id: "origin_class",
      accessorKey: "origin_class",
      header: "Origin",
      filter: "select",
      width: 190,
      cell: (row) => (
        <span className="truncate text-muted-foreground">
          {originClassLabel(row.origin_class)}
        </span>
      ),
    },
  },
  {
    id: "provider_account",
    label: "Provider account",
    facet: "provider_account",
    column: {
      id: "provider_account",
      accessorKey: "provider_account",
      header: "Provider account",
      filter: "select",
      width: 180,
      cell: (row) =>
        row.provider_account ? (
          <span className="truncate" title={row.provider_account}>
            {row.provider_account}
          </span>
        ) : row.provider ? (
          <Muted>Not reported</Muted>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "owner_email",
    label: "AI Matrx account",
    facet: "owner_email",
    column: {
      id: "owner_email",
      accessorKey: "owner_email",
      header: "AI Matrx account",
      filter: "select",
      width: 200,
      cell: (row) => (
        <span className="truncate text-muted-foreground">
          {row.owner_email ?? "—"}
        </span>
      ),
    },
  },
  // ── Off by default. Present, one click away, never a code change. ────────
  {
    id: "title_source",
    label: "Title source",
    defaultHidden: true,
    facet: "title_source",
    column: {
      id: "title_source",
      accessorKey: "title_source",
      header: "Title source",
      filter: "select",
      width: 150,
      cell: (row) => {
        const provenance = titleProvenance(row.title_source, row.provider);
        return (
          <span
            className="truncate text-muted-foreground"
            title={provenance.detail}
          >
            {provenance.chip}
          </span>
        );
      },
    },
  },
  {
    id: "fidelity",
    label: "Fidelity",
    defaultHidden: true,
    facet: "fidelity",
    column: {
      id: "fidelity",
      accessorKey: "fidelity",
      header: "Fidelity",
      filter: "select",
      width: 150,
      cell: (row) => {
        if (!row.fidelity) return <Muted>—</Muted>;
        const verdict = fidelityVerdict(row.fidelity);
        return (
          <span className="truncate text-muted-foreground" title={verdict.detail}>
            {verdict.label}
          </span>
        );
      },
    },
  },
  {
    id: "binding_status",
    label: "Sync state",
    defaultHidden: true,
    facet: "binding_status",
    column: {
      id: "binding_status",
      accessorKey: "binding_status",
      header: "Sync state",
      filter: "select",
      width: 120,
      cell: (row) =>
        row.binding_status ? (
          <span className="truncate text-muted-foreground">
            {formatText(row.binding_status)}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "binding_last_seen_at",
    label: "Last delivery",
    defaultHidden: true,
    column: {
      id: "binding_last_seen_at",
      accessorKey: "binding_last_seen_at",
      header: "Last delivery",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 130,
      align: "right",
      cell: (row) => timeCell(row.binding_last_seen_at),
    },
  },
  {
    id: "source_feature",
    label: "Feature",
    defaultHidden: true,
    facet: "source_feature",
    column: {
      id: "source_feature",
      accessorKey: "source_feature",
      header: "Feature",
      filter: "select",
      width: 170,
      cell: (row) =>
        row.source_feature ? (
          <span className="truncate text-muted-foreground">
            {row.source_feature}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "created",
    label: "Created",
    defaultHidden: true,
    column: {
      id: "created",
      accessorKey: "created_at",
      header: "Created",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 120,
      align: "right",
      cell: (row) => timeCell(row.created_at),
    },
  },
  {
    id: "organization_name",
    label: "Organization",
    scopedToShared: true,
    defaultHidden: true,
    facet: "organization_name",
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      filter: "text",
      width: 170,
      // THE DOOR LAW: the RPC returns organization_id beside the name, so the
      // org is a relationship we RESOLVED — rendering it as bare text would
      // throw that away.
      cell: (row) =>
        row.organization_name && row.organization_id ? (
          <EntityRef
            token="organization"
            id={row.organization_id}
            name={row.organization_name}
            className="text-muted-foreground"
          />
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "access_level",
    label: "Access",
    scopedToShared: true,
    defaultHidden: true,
    facet: "access_level",
    column: {
      id: "access_level",
      accessorKey: "access_level",
      header: "Access",
      filter: "select",
      width: 110,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[10px] capitalize">
          {row.access_level}
        </Badge>
      ),
    },
  },
  {
    id: "archived",
    label: "Archived",
    defaultHidden: true,
    facet: "archived",
    column: {
      id: "archived",
      accessorKey: "is_archived",
      header: "Archived",
      filter: "boolean",
      width: 90,
      align: "center",
      cell: (row) =>
        row.is_archived ? (
          <Archive className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
];
