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
import { Download, FileText, History, Presentation } from "lucide-react";
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
import {
  readGoogleComments,
  readGooglePresentation,
  readGoogleRevisions,
} from "../api";
import type { ConnectedSourceRow } from "../types";
import {
  CONNECTED_SOURCE_SCOPES,
  createConnectedSourceListService,
  type ConnectedBrowseReport,
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

const SOURCE_COLUMNS: EntityColumnSpec<ConnectedSourceRow>[] = [
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
          {row.subtitle ? (
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
      header: "Kind",
      sortable: false,
      filter: false,
      cell: (row) => (
        <Badge variant="secondary">{KIND_WORDS[row.kind] ?? row.kind}</Badge>
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
    column: {
      id: "modified_at",
      accessorKey: "modified_at",
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

/** True when this Source can be opened down to its comments and revisions. */
function readsExpertSignal(row: ConnectedSourceRow): boolean {
  return row.attributes.reads_comments === true;
}

function connectionIdOf(row: ConnectedSourceRow): string | null {
  const value = row.attributes.connection_id;
  return typeof value === "string" ? value : null;
}

/**
 * The bulk verbs. Each one names its consequence before it runs, and each one
 * is honest about what it can reach: reading corrections only makes sense for a
 * picked Google file, so it refuses by name on anything else rather than
 * running and returning nothing.
 */
function bulkActions(
  dispatch: AppDispatch,
): EntityBulkAction<ConnectedSourceRow>[] {
  return [
    {
      id: "read-comments",
      label: "Read corrections",
      icon: FileText,
      variant: "outline",
      confirm: (selection) => ({
        title: "Read the corrections on these files",
        description: `AI Matrx will read every comment, reply and quoted passage on ${selection.rows.length} file(s). Nothing is changed in Google, and nothing is sent anywhere — the corrections are read back to you here.`,
        confirmLabel: "Read them",
      }),
      run: async (selection) => {
        const eligible = selection.rows.filter(readsExpertSignal);
        if (!eligible.length) {
          return {
            message:
              "None of the selected items is a picked Google file, so there are no comments to read. Corrections live on Google Docs, Sheets and Slides you have picked.",
          };
        }
        let comments = 0;
        let replies = 0;
        for (const row of eligible) {
          const connectionId = connectionIdOf(row);
          if (!connectionId) continue;
          const thread = await readGoogleComments(
            dispatch,
            connectionId,
            row.external_id,
          );
          comments += thread.comments.length;
          replies += thread.total_replies;
        }
        return {
          message: `Read ${comments} comment(s) and ${replies} repl(y/ies) across ${eligible.length} file(s).`,
          keepSelection: true,
        };
      },
    },
    {
      id: "read-revisions",
      label: "Read history",
      icon: History,
      variant: "outline",
      run: async (selection) => {
        const eligible = selection.rows.filter(readsExpertSignal);
        if (!eligible.length) {
          return {
            message:
              "None of the selected items is a picked Google file, so there is no revision history to read.",
          };
        }
        let revisions = 0;
        for (const row of eligible) {
          const connectionId = connectionIdOf(row);
          if (!connectionId) continue;
          const history = await readGoogleRevisions(
            dispatch,
            connectionId,
            row.external_id,
          );
          revisions += history.revisions.length;
        }
        return {
          message: `Read ${revisions} kept revision(s) across ${eligible.length} file(s).`,
          keepSelection: true,
        };
      },
    },
    {
      id: "read-speaker-notes",
      label: "Read speaker notes",
      icon: Presentation,
      variant: "outline",
      run: async (selection) => {
        const decks = selection.rows.filter(
          (row) => row.attributes.reads_speaker_notes === true,
        );
        if (!decks.length) {
          return {
            message:
              "No Slides deck is selected. Speaker notes live on a picked Google Slides deck.",
          };
        }
        let slides = 0;
        let withNotes = 0;
        for (const row of decks) {
          const connectionId = connectionIdOf(row);
          if (!connectionId) continue;
          const deck = await readGooglePresentation(
            dispatch,
            connectionId,
            row.external_id,
          );
          slides += deck.slides.length;
          withNotes += deck.slides_with_notes;
        }
        return {
          message: `Read ${slides} slide(s), ${withNotes} of them carrying speaker notes.`,
          keepSelection: true,
        };
      },
    },
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
 */
function useConnectedSourceRowActions(
  _list: EntityListController<ConnectedSourceRow>,
): EntityRowActionsResult<ConnectedSourceRow> {
  const openRow = useCallback((row: ConnectedSourceRow) => {
    if (!row.url) {
      toast.info(
        `${row.title} has no link of its own in ${row.adapter.replace(/_/g, " ")}, so there is nothing to open. Select it and use a bulk action instead.`,
      );
      return;
    }
    window.open(row.url, "_blank", "noopener,noreferrer");
  }, []);

  const menuFor = useCallback(
    (row: ConnectedSourceRow) => () => ({
      header: { title: row.title },
      sections: [
        {
          id: "open",
          items: [
            {
              id: "open",
              label: row.url ? "Open where it lives" : "No link for this item",
              disabled: !row.url,
              onSelect: () => openRow(row),
            },
          ],
        },
      ],
    }),
    [openRow],
  );

  return { actions: { menuFor, onOpenRow: openRow } };
}

export function createConnectedSourceListConfig(
  dispatch: AppDispatch,
  target: ConnectedBrowseTarget,
  organizationId: string | null,
  onReport?: (report: ConnectedBrowseReport) => void,
): EntityListConfig<ConnectedSourceRow> {
  return {
    surfaceKey: "connected-sources-browse",
    entityLabel: { singular: "Source", plural: "Sources" },
    sourceFeature: "transcription",
    scopes: CONNECTED_SOURCE_SCOPES,
    service: createConnectedSourceListService(dispatch, target, onReport),
    // The active organization and the chosen account are BOTH inputs to this
    // service: switching either must re-ask the server, never re-render the
    // answer it got for the other one.
    serviceKey: `connected-sources:${organizationId ?? "none"}:${target.adapter}:${target.connectionId}:${target.containerId ?? ""}`,
    columns: SOURCE_COLUMNS,
    prefsVersion: 1,
    getRowId: (row) => row.id,
    getRowName: (row) => row.title,
    door: { hrefFor: (row) => row.url ?? undefined },
    useRowActions: useConnectedSourceRowActions,
    // Someone else's mailbox has no archive axis of ours.
    supportsArchived: false,
    facetSections: [],
    bulkActions: bulkActions(dispatch),
    bulkSelection: { noun: "source" },
    emptyState: {
      title: "Nothing here yet",
      description:
        "Pick a connected account above and press Browse. The whole drive, mailbox, calendar or chat list is walked live — nothing is copied into AI Matrx until you select it.",
    },
  };
}
