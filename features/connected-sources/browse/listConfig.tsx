"use client";

/**
 * Browse everything in a connected account — the list.
 *
 * ONE config for every adapter. A mailbox, a drive, a calendar and a chat list
 * render through the same columns because the server's Source row is
 * adapter-independent; branching on adapter here would rebuild, per provider,
 * exactly what the Library of Sources contract exists to prevent.
 *
 * Sorting is declared UNSUPPORTED rather than faked: the server walks the
 * provider in the provider's own order, and sorting the 50 rows a page happens
 * to hold while implying a sorted corpus is the lie the column policy forbids.
 */

import { useCallback } from "react";
import { Download, ExternalLink } from "lucide-react";
import type { AppDispatch } from "@/lib/redux/store";
import type {
  EntityListConfig,
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { Muted, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import type { EntityBulkAction } from "@/lib/entity-list/selection";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import type { ConnectedSourceRow } from "../types";
import { SOURCE_READS, runSourceRead, type SourceReadSpec } from "./reads";
import type { ConnectedReadResult } from "../components/ReadResultsDialog";
import {
  CONNECTED_SOURCE_SCOPES,
  createConnectedSourceListService,
  type ConnectedBrowseStatus,
  type ConnectedBrowseTarget,
} from "./service";
import { formatFileSize } from "@ai-matrx/kit/format";

const KIND_WORDS: Record<string, string> = {
  file: "File",
  folder: "Folder",
  email: "Email",
  email_thread: "Thread",
  calendar_event: "Meeting",
  chat: "Chat",
  chat_message: "Message",
  document: "Doc",
  spreadsheet: "Sheet",
  presentation: "Slides",
};

/**
 * AN OPTION-BINDING WRAPPER over `@ai-matrx/kit/format`. What it binds is this
 * column's own statement for "no size on record" — an EMPTY CELL rather than an
 * em-dash, because the column is one of several and a placeholder in every row
 * would be noise. The binary tiers and the rounding are the package's.
 */
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes <= 0) return "";
  return formatFileSize(bytes);
}

/**
 * Sources whose rows carry no time at all, by construction: a picked Google
 * file is a row in our pick registry, which records WHAT was picked, not when
 * Google last changed it. Its When column starts hidden (still in the column
 * picker) — the auto-hide below only judges three or more rows, and an account
 * with two picked files showed a column of dashes (page-pass 2026-09-27).
 */
const ADAPTERS_WITHOUT_TIMES = new Set(["google_picked_files"]);

function sourceColumns(adapter: string): EntityColumnSpec<ConnectedSourceRow>[] {
  return [
  {
    id: "title",
    label: "Name",
    locked: true,
    phone: "title",
    column: {
      id: "title",
      accessorKey: "title",
      header: "Name",
      sortable: false,
      filter: false,
      cell: (row) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm">{row.title}</span>
          {row.subtitle && row.subtitle !== row.author ? (
            <span className="truncate text-xs text-muted-foreground">
              {row.subtitle}
            </span>
          ) : null}
        </div>
      ),
    },
  },
  {
    id: "kind",
    label: "Kind",
    phone: "meta",
    column: {
      id: "kind",
      accessorKey: "kind",
      width: 110,
      header: "Kind",
      sortable: false,
      filter: false,
      cell: (row) => (
        <Badge variant="secondary" className="text-xs">{KIND_WORDS[row.kind] ?? row.kind}</Badge>
      ),
    },
  },
  {
    id: "author",
    label: "From",
    phone: "meta",
    column: {
      id: "author",
      accessorKey: "author",
      width: 240,
      header: "From",
      sortable: false,
      filter: false,
      cell: (row) =>
        row.author ? (
          <span className="truncate text-sm">{row.author}</span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "modified_at",
    label: "When",
    phone: "meta",
    defaultHidden: ADAPTERS_WITHOUT_TIMES.has(adapter),
    column: {
      id: "modified_at",
      accessorKey: "modified_at",
      width: 140,
      header: "When",
      sortable: false,
      filter: false,
      cell: (row) => timeCell(row.modified_at ?? row.created_at),
    },
  },
  {
    id: "size_bytes",
    label: "Size",
    defaultHidden: true,
    column: {
      id: "size_bytes",
      accessorKey: "size_bytes",
      width: 110,
      header: "Size",
      sortable: false,
      filter: false,
      cell: (row) =>
        row.size_bytes ? (
          <span className="text-sm tabular-nums">{formatBytes(row.size_bytes)}</span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  ];
}

/**
 * The bulk verbs. Each read opens what it read (every comment, revision or
 * speaker note, in a dialog with Copy), never just a count. A read with nothing
 * it can act on is a REFUSAL: it says why as information, announces no success
 * and keeps the selection (the shell treats a `void` result as "did not run").
 */
function readAsBulkAction(
  spec: SourceReadSpec,
  dispatch: AppDispatch,
  onRead: (result: ConnectedReadResult) => void,
): EntityBulkAction<ConnectedSourceRow> {
  return {
    id: `read-${spec.kind}`,
    label: spec.label,
    icon: spec.icon,
    variant: "outline",
    run: async (selection) => {
      const outcome = await runSourceRead(dispatch, spec.kind, selection.rows);
      if (!outcome.ok) {
        toast.warning(outcome.refusal);
        return;
      }
      onRead(outcome.result);
      return {
        keepSelection: true,
        message:
          outcome.skipped > 0
            ? `${spec.label}: ${outcome.result.files.length} read, ${outcome.skipped} skipped (not a picked Google file of that kind).`
            : `${spec.label}: ${outcome.result.files.length} read.`,
      };
    },
  };
}

function bulkActions(
  dispatch: AppDispatch,
  onRead: (result: ConnectedReadResult) => void,
): EntityBulkAction<ConnectedSourceRow>[] {
  return [
    ...SOURCE_READS.map((spec) => readAsBulkAction(spec, dispatch, onRead)),
    {
      id: "export-selection",
      label: "Export list",
      icon: Download,
      variant: "outline",
      run: (selection) => {
        const header = "id,kind,title,from,when,url";
        const lines = selection.rows.map((row) =>
          [
            row.id,
            row.kind,
            row.title,
            row.author ?? "",
            row.modified_at ?? row.created_at ?? "",
            row.url ?? "",
          ]
            .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
            .join(","),
        );
        const blob = new Blob([[header, ...lines].join("\n")], {
          type: "text/csv;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "connected-sources.csv";
        anchor.click();
        URL.revokeObjectURL(url);
        return { message: `Exported ${selection.rows.length} row(s).` };
      },
    },
  ];
}

/**
 * A Source lives in someone else's account, so "open" means open it THERE.
 * Every row that has a provider URL opens it; a row without one (a Teams
 * message has no permalink on this grant) says so instead of a dead click.
 *
 * The same three reads as the bulk bar sit on the row ⋮ menu AND the
 * right-click menu (one `menuFor` feeds both) — offered only on rows that can
 * be read that way, so no entry is ever a refusal waiting to happen.
 */
function createRowActionsHook(
  dispatch: AppDispatch,
  onRead: (result: ConnectedReadResult) => void,
) {
  return function useConnectedSourceRowActions(
    _list: EntityListController<ConnectedSourceRow>,
  ): EntityRowActionsResult<ConnectedSourceRow> {
    const openRow = useCallback((row: ConnectedSourceRow) => {
      if (!row.url) {
        toast.info(
          `${row.title} has no link of its own in ${row.adapter.replace(/_/g, " ")}, so there is nothing to open.`,
        );
        return;
      }
      window.open(row.url, "_blank", "noopener,noreferrer");
    }, []);

    const readRow = useCallback(
      async (spec: SourceReadSpec, row: ConnectedSourceRow) => {
        try {
          const outcome = await runSourceRead(dispatch, spec.kind, [row]);
          if (!outcome.ok) {
            toast.warning(outcome.refusal);
            return;
          }
          onRead(outcome.result);
        } catch (error) {
          toast.error(extractErrorMessage(error));
        }
      },
      [],
    );

    const menuFor = useCallback(
      (row: ConnectedSourceRow) => () => {
        const reads = SOURCE_READS.filter((spec) => spec.eligible(row));
        return {
          header: { title: row.title },
          sections: [
            {
              id: "open",
              items: [
                {
                  id: "open",
                  label: "Open where it lives",
                  icon: ExternalLink,
                  disabled: !row.url,
                  ...(row.url
                    ? {}
                    : {
                        disabledReason:
                          "The provider gives this item no link of its own. Select it and use Export list instead.",
                      }),
                  onSelect: () => openRow(row),
                },
              ],
            },
            ...(reads.length
              ? [
                  {
                    id: "read",
                    items: reads.map((spec) => ({
                      id: `read-${spec.kind}`,
                      label: spec.label,
                      icon: spec.icon,
                      onSelect: () => void readRow(spec, row),
                    })),
                  },
                ]
              : []),
          ],
        };
      },
      [openRow, readRow],
    );

    return { actions: { menuFor, onOpenRow: openRow } };
  };
}

/** What an empty account means, per source — never "matching your search" with no search. */
function emptyStateFor(adapter: string): { title: string; description: string } {
  if (adapter === "google_picked_files") {
    return {
      title: "No Google files picked yet",
      description:
        "Only the Docs, Sheets and Slides you pick for AI Matrx appear here. Pick some in Settings → Integrations → Google Workspace.",
    };
  }
  return {
    title: "Nothing in this account",
    description:
      "The account was read live and holds nothing this source can list. Pick another account above.",
  };
}

export function createConnectedSourceListConfig(
  dispatch: AppDispatch,
  target: ConnectedBrowseTarget,
  organizationId: string | null,
  onStatus: (status: ConnectedBrowseStatus) => void,
  onRead: (result: ConnectedReadResult) => void,
): EntityListConfig<ConnectedSourceRow> {
  return {
    surfaceKey: "connected-sources-browse",
    entityLabel: { singular: "Source", plural: "Sources" },
    sourceFeature: "media_catalog",
    scopes: CONNECTED_SOURCE_SCOPES,
    service: createConnectedSourceListService(dispatch, target, onStatus),
    // The active organization and the chosen account are BOTH inputs to this
    // service: switching either must re-ask the server, never re-render the
    // answer it got for the other one.
    serviceKey: `connected-sources:${organizationId ?? "none"}:${target.adapter}:${target.connectionId}:${target.containerId ?? ""}`,
    columns: sourceColumns(target.adapter),
    // A picked Google file carries no time (the pick registry records WHAT was
    // picked, not when Google last changed it), and one account's rows all
    // carry the same From. A column that says nothing per row starts hidden,
    // still in the column picker — never a column of dashes.
    autoHideUniformColumns: true,
    // 2: When starts hidden for sources that carry no time.
    prefsVersion: 2,
    getRowId: (row) => row.id,
    getRowName: (row) => row.title,
    door: { hrefFor: (row) => row.url ?? undefined },
    useRowActions: createRowActionsHook(dispatch, onRead),
    // Someone else's mailbox has no archive axis of ours.
    supportsArchived: false,
    facetSections: [],
    bulkActions: bulkActions(dispatch, onRead),
    bulkSelection: { noun: "source" },
    emptyState: emptyStateFor(target.adapter),
  };
}
