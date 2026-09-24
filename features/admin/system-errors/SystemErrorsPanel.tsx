"use client";

/**
 * System Errors — the durable `public.system_error` ledger, read over the API.
 *
 * The source supplies at most its newest 1,000 matching rows. Kind, time-window,
 * request-id, and unresolved status stay source filters because alarm links must
 * narrow the evidence before it is read; the canonical table owns local search,
 * column filters, sorting, progressive reveal, detail, and copy for that window.
 */

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useInfiniteQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
  MatrxDataTableToolbar,
} from "@ai-matrx/design-system/data-table/types";
import { apiGet } from "@/lib/api/typed-client";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { components } from "@/types/python-generated/api-types";

type SystemErrorRow = components["schemas"]["SystemErrorRecord"];
type RecentResponse =
  components["schemas"]["aidream__api__routers__admin_system_errors__SystemErrorListResponse"];

const HOUR_PRESETS = [6, 24, 72, 168] as const;
const SOURCE_PAGE_SIZE = 500;

function value(raw: string | null | undefined): string {
  return raw || "—";
}

function summarize(row: SystemErrorRow): string {
  return [
    `id: ${row.id}`,
    `kind: ${value(row.kind)}`,
    `error_type: ${value(row.error_type)}`,
    `route: ${value(row.route)}`,
    `source_app: ${value(row.source_app)}`,
    `source_feature: ${value(row.source_feature)}`,
    `occurred_at: ${value(row.occurred_at)}`,
    `resolved_at: ${value(row.resolved_at)}`,
    `request_id: ${value(row.request_id)}`,
    `conversation_id: ${value(row.conversation_id)}`,
    `agent_id: ${value(row.agent_id)}`,
    "",
    row.error_text ?? "",
    "",
    row.traceback ?? "(no traceback recorded)",
  ].join("\n");
}

function displayDate(raw: string | null | undefined): string {
  return raw ? new Date(raw).toLocaleString() : "—";
}

function renderEvidenceDetail(row: SystemErrorRow) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">Request ID</span>
        <span className="break-all font-mono">{value(row.request_id)}</span>
        <span className="text-muted-foreground">Conversation ID</span>
        <span className="min-w-0 break-all font-mono">
          {row.conversation_id ? (
            <EntityRef
              token="conversation"
              id={row.conversation_id}
              name={row.conversation_id}
              showIcon={false}
              openInNewTab
              wrap
            />
          ) : (
            "—"
          )}
        </span>
        <span className="text-muted-foreground">Agent ID</span>
        <span className="min-w-0 break-all font-mono">
          {row.agent_id ? (
            <EntityRef
              token="agent"
              id={row.agent_id}
              name={row.agent_id}
              showIcon={false}
              openInNewTab
              wrap
            />
          ) : (
            "—"
          )}
        </span>
        <span className="text-muted-foreground">Resolution note</span>
        <span className="whitespace-pre-wrap">
          {value(row.resolution_note)}
        </span>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Traceback
        </p>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs">
          {row.traceback ?? "(no traceback recorded)"}
        </pre>
      </div>
    </div>
  );
}

export default function SystemErrorsPanel() {
  // An alarm's link must land on exactly its own evidence, never a broad list.
  const searchParams = useSearchParams();
  const linkedHours = Number(searchParams.get("hours"));
  const [kind, setKind] = useState(() => searchParams.get("kind") ?? "");
  const [requestId] = useState(() => searchParams.get("request_id") ?? "");
  const [hours, setHours] = useState(() =>
    Number.isFinite(linkedHours) && linkedHours > 0
      ? Math.min(linkedHours, 720)
      : 24,
  );
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const [tableQuery, setTableQuery] = useState<MatrxDataTableQueryState>({
    page: 1,
    pageSize: 50,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: null,
  });

  const trimmedKind = kind.trim();
  const {
    data,
    isFetching,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    isFetchingNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["system-errors", trimmedKind, hours, unresolvedOnly, requestId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<RecentResponse> => {
      const result = await apiGet("/admin/system-errors/recent", {
        query: {
          since: new Date(Date.now() - hours * 3600_000).toISOString(),
          limit: SOURCE_PAGE_SIZE,
          offset: pageParam,
          kind: trimmedKind || undefined,
          request_id: requestId || undefined,
          unresolved_only: unresolvedOnly || undefined,
        },
      });
      return result.data;
    },
    getNextPageParam: (lastPage) =>
      lastPage.offset + lastPage.count < lastPage.total
        ? lastPage.offset + lastPage.count
        : undefined,
  });

  const rows = useMemo(
    () => data?.pages.flatMap((page) => page.errors) ?? [],
    [data],
  );
  const total = data?.pages[0]?.total;
  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : null;
  const byKind = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.kind ?? "(no kind)";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [rows]);

  const columns = useMemo(
    (): MatrxColumnDef<SystemErrorRow>[] => [
      {
        id: "occurred_at",
        accessorKey: "occurred_at",
        header: "Occurred",
        filter: "date",
        width: 170,
        cell: (row) => (
          <span
            className="whitespace-nowrap text-xs"
            title={displayDate(row.occurred_at)}
          >
            {displayDate(row.occurred_at)}
          </span>
        ),
      },
      {
        id: "kind",
        accessorKey: "kind",
        header: "Kind",
        filter: "select",
        width: 190,
        cell: (row) => (
          <Badge
            variant="secondary"
            className="max-w-[180px] truncate"
            title={value(row.kind)}
          >
            {value(row.kind)}
          </Badge>
        ),
      },
      {
        id: "error_type",
        accessorKey: "error_type",
        header: "Type",
        filter: "select",
        width: 180,
        cell: (row) => (
          <span
            className="block truncate text-xs"
            title={value(row.error_type)}
          >
            {value(row.error_type)}
          </span>
        ),
      },
      {
        id: "error_text",
        accessorKey: "error_text",
        header: "Error",
        width: 340,
        cell: (row) => (
          <span
            className="block truncate text-sm"
            title={value(row.error_text)}
          >
            {value(row.error_text)}
          </span>
        ),
      },
      {
        id: "route",
        accessorKey: "route",
        header: "Route",
        filter: "select",
        width: 180,
        cell: (row) => (
          <span
            className="block truncate font-mono text-xs"
            title={value(row.route)}
          >
            {value(row.route)}
          </span>
        ),
      },
      {
        id: "source_app",
        accessorKey: "source_app",
        header: "App",
        filter: "select",
        width: 130,
        cell: (row) => (
          <span
            className="block truncate text-xs"
            title={value(row.source_app)}
          >
            {value(row.source_app)}
          </span>
        ),
      },
      {
        id: "source_feature",
        accessorKey: "source_feature",
        header: "Feature",
        filter: "select",
        width: 150,
        cell: (row) => (
          <span
            className="block truncate text-xs"
            title={value(row.source_feature)}
          >
            {value(row.source_feature)}
          </span>
        ),
      },
      {
        id: "resolved_at",
        accessorKey: "resolved_at",
        header: "Resolved",
        filter: "date",
        width: 170,
        cell: (row) =>
          row.resolved_at ? (
            <span
              className="whitespace-nowrap text-xs"
              title={displayDate(row.resolved_at)}
            >
              {displayDate(row.resolved_at)}
            </span>
          ) : (
            <Badge variant="outline">Open</Badge>
          ),
      },
      {
        id: "id",
        accessorKey: "id",
        header: "ID",
        cellKind: "uuid",
        hidden: true,
      },
      {
        id: "request_id",
        accessorKey: "request_id",
        header: "Request ID",
        hidden: true,
      },
      {
        id: "conversation_id",
        accessorKey: "conversation_id",
        header: "Conversation ID",
        cellKind: "uuid",
        hidden: true,
      },
      {
        id: "user_id",
        accessorKey: "user_id",
        header: "User ID",
        cellKind: "uuid",
        hidden: true,
      },
      {
        id: "agent_id",
        accessorKey: "agent_id",
        header: "Agent ID",
        cellKind: "uuid",
        hidden: true,
      },
    ],
    [],
  );

  const toolbar = useMemo(
    (): MatrxDataTableToolbar => ({
      title: "System Errors",
      titleCount: {
        value: rows.length,
        label:
          total === undefined ? "loaded" : `loaded / ${total.toLocaleString()}`,
      },
      search: false,
      customSearch: (
        <Input
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          placeholder="Source filter by kind…"
          className="h-8 min-w-[220px] sm:w-80"
          aria-label="Source filter by error kind"
        />
      ),
      facets: [
        {
          type: "custom",
          id: "system-error-source-filters",
          filter: {
            active: Boolean(trimmedKind) || hours !== 24 || unresolvedOnly,
            onReset: () => {
              setKind("");
              setHours(24);
              setUnresolvedOnly(false);
            },
          },
          render: () => (
            <div className="flex w-full min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain pb-1 scrollbar-hide">
              <div className="flex shrink-0 items-center gap-1">
                {HOUR_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    size="sm"
                    variant={hours === preset ? "default" : "outline"}
                    className="whitespace-nowrap"
                    onClick={() => setHours(preset)}
                  >
                    {preset}h
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant={unresolvedOnly ? "default" : "outline"}
                  className="whitespace-nowrap"
                  onClick={() => setUnresolvedOnly((current) => !current)}
                >
                  Unresolved only
                </Button>
              </div>
              {byKind.length > 1 ? (
                <div className="flex shrink-0 items-center gap-1 border-l border-border pl-1">
                  {byKind.map(([candidate, count]) => (
                    <Button
                      key={candidate}
                      size="sm"
                      variant={
                        candidate === trimmedKind ? "default" : "outline"
                      }
                      className="whitespace-nowrap"
                      onClick={() =>
                        setKind(candidate === "(no kind)" ? "" : candidate)
                      }
                    >
                      {candidate} ({count})
                    </Button>
                  ))}
                </div>
              ) : null}
              {requestId ? (
                <span className="shrink-0 whitespace-nowrap px-1 text-xs text-muted-foreground">
                  Evidence request: {requestId}
                </span>
              ) : null}
            </div>
          ),
        },
      ],
      refresh: {
        onRefresh: async () => {
          await refetch();
        },
      },
    }),
    [
      byKind,
      hours,
      kind,
      refetch,
      requestId,
      rows.length,
      trimmedKind,
      unresolvedOnly,
    ],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}
      <div className="min-h-0 flex-1">
        <MatrxDataTable<SystemErrorRow>
          urlState={{ id: "system-errors" }}
          data={rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={isLoading}
          isFetching={isFetching}
          pageSize={50}
          query={{
            mode: "controlled-append",
            state: tableQuery,
            onStateChange: setTableQuery,
            sourceProcessing: {
              search: "local",
              columnFilters: "local",
              sort: "local",
              sourceTotal: total,
            },
            pagination: {
              queryKey: "system-errors",
              rows,
              loading: isLoading,
              isFetchingNextPage,
              error:
                error instanceof Error
                  ? error
                  : error
                    ? new Error(String(error))
                    : null,
              hasNextPage: Boolean(hasNextPage),
              loadNextPage: async () => {
                await fetchNextPage();
              },
              refresh: () => {
                void refetch();
              },
              totalItems: total,
            },
          }}
          coverage={{
            loaded: rows.length,
            total,
            answeredBy: "client",
            noun: "system error",
          }}
          toolbar={toolbar}
          emptyState={{
            title: errorMessage
              ? "System errors unavailable"
              : "No errors recorded in this window",
            description: errorMessage
              ? "The error ledger source failed. Refresh to retry."
              : "Widen the source time window or clear the kind filter to double-check.",
          }}
          copy={{
            label: "System error",
            listLabel: "System errors (this loaded view)",
            location: "/administration/utilities/system-errors",
            rowKind: "system-error",
            listKind: "system-errors",
            listDescription:
              "Every matching source row is fetched as you scroll; table search and columns apply locally.",
            humanRow: summarize,
            rowAttributes: (row) => ({
              id: row.id,
              kind: row.kind,
              error_type: row.error_type,
              occurred_at: row.occurred_at,
            }),
          }}
          detail={{
            title: (row) => row.error_type || row.kind || "System error",
            description: (row) => displayDate(row.occurred_at),
            render: renderEvidenceDetail,
          }}
          window={{
            renderView: renderEvidenceDetail,
            renderEdit: false,
            defaultTab: "view",
          }}
        />
      </div>
    </div>
  );
}
