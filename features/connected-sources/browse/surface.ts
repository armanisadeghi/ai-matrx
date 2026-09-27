// features/connected-sources/browse/surface.ts
//
// The `matrx-user/connected-sources` runtime: ONE pure state → scope mapper.
// It reads what the page already rendered (the adapter list, the chosen
// account, the list controller, the server's last sentence) and never fetches.
// No RECORD writes: every row lives in someone else's account. The targets are
// the three reads a person has (see the manifest header), run through the SAME
// `runSourceRead` the bulk bar and the row menus use.

import type {
  EntityListSurface,
  EntityListSurfaceController,
} from "@/lib/entity-list/components/EntityListPage";
import { xmlElement, xmlList, xmlText } from "@/features/surfaces/runtime/context-bundle";
import {
  CONNECTED_SOURCES_SURFACE_NAME,
  createConnectedSourcesScope,
} from "@/features/surfaces/manifests/connected-sources.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { AppDispatch } from "@/lib/redux/store";
import type { ConnectedAdapterRow, ConnectedSourceRow } from "../types";
import {
  readResultText,
  type ConnectedReadResult,
} from "../components/ReadResultsDialog";
import { runSourceRead, sourceReadSpec, type SourceReadKind } from "./reads";

type List = EntityListSurfaceController<ConnectedSourceRow>;

/** What the page holds OUTSIDE the list — the same state it renders. */
export interface ConnectedSourcesPageState {
  /** null while the adapter list loads (or failed — see loadError). */
  adapters: ConnectedAdapterRow[] | null;
  loadError: string | null;
  chosen: { adapter: string; connectionId: string } | null;
  summary: string | null;
}

function browsingOf(state: ConnectedSourcesPageState) {
  if (!state.chosen || !state.adapters) return undefined;
  const adapter = state.adapters.find((a) => a.adapter === state.chosen?.adapter);
  const connection = adapter?.connections.find(
    (c) => c.connection_id === state.chosen?.connectionId,
  );
  if (!adapter || !connection) return undefined;
  return {
    adapter: adapter.adapter,
    source_title: adapter.title,
    connection_id: connection.connection_id,
    email: connection.account_email,
  };
}

function buildSourceListXml(list: List, account: string | null): string {
  return (
    xmlList(
      "sources",
      list.rows,
      (row) =>
        xmlElement(
          "source",
          {
            id: row.id,
            kind: row.kind,
            from: row.author,
            when: (row.modified_at ?? row.created_at)?.slice(0, 10),
          },
          [row.title, xmlText("subtitle", row.subtitle, { max: 160 })],
        ),
      {
        maxRows: 25,
        attrs: { account, search: list.query.search.trim() || null },
      },
    ) || `<sources total="0"/>`
  );
}

/** The whole page's scope. `list` is absent outside the list (loading, no account). */
export function buildConnectedSourcesScope(
  state: ConnectedSourcesPageState,
  list?: List,
): SurfaceScopePayload {
  const browsing = browsingOf(state);
  const listError = list?.error?.message ?? null;
  const loadError = state.loadError ?? listError;
  const listLoaded = list && !list.isLoading && !list.error;
  return createConnectedSourcesScope({
    search_query: list?.query.search ?? "",
    ...(state.adapters
      ? {
          connected_accounts: state.adapters.map((a) => ({
            adapter: a.adapter,
            title: a.title,
            connected: a.connected,
            accounts: a.connections.map((c) => ({
              connection_id: c.connection_id,
              email: c.account_email,
            })),
            cannot_reach: a.limitation,
            unavailable_reason: a.unavailable_reason,
          })),
        }
      : {}),
    ...(browsing ? { browsing } : {}),
    ...(listLoaded
      ? {
          source_list: buildSourceListXml(list, browsing?.email ?? null),
          sources: list.rows.map((row) => ({
            id: row.id,
            external_id: row.external_id,
            kind: row.kind,
            title: row.title,
            subtitle: row.subtitle,
            author: row.author,
            modified_at: row.modified_at,
            created_at: row.created_at,
            size_bytes: row.size_bytes,
            url: row.url,
          })),
          selected_ids: list.selectedIds,
        }
      : {}),
    ...(state.summary && list ? { browse_summary: state.summary } : {}),
    ...(loadError ? { load_error: loadError } : {}),
  });
}

const MAX_READ_IDS = 25;
/** What an agent gets back from one read — enough to work from, never a flood. */
const MAX_READ_RETURN_CHARS = 20_000;

/** The ids an agent named, resolved against the rows ON SCREEN — or a refusal. */
export function resolveReadRows(
  value: unknown,
  rows: readonly ConnectedSourceRow[],
): ConnectedSourceRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `Send a JSON array of 1-${MAX_READ_IDS} source ids from sources, source_list or selected_ids.`,
    );
  }
  if (value.length > MAX_READ_IDS) {
    throw new Error(`At most ${MAX_READ_IDS} sources per read; ${value.length} were sent.`);
  }
  const byId = new Map(rows.map((row) => [row.id, row]));
  const picked: ConnectedSourceRow[] = [];
  const unknown: string[] = [];
  for (const entry of value) {
    const id =
      typeof entry === "string"
        ? entry
        : typeof entry === "object" && entry !== null && "id" in entry
          ? String((entry as { id: unknown }).id)
          : "";
    const row = byId.get(id);
    if (row) picked.push(row);
    else unknown.push(id || JSON.stringify(entry));
  }
  if (unknown.length) {
    throw new Error(
      `Not on screen: ${unknown.join(", ")}. Use ids from sources, source_list or selected_ids; nothing was read.`,
    );
  }
  return picked;
}

function readTarget(
  kind: SourceReadKind,
  list: List,
  dispatch: AppDispatch,
  onRead: (result: ConnectedReadResult) => void,
) {
  const spec = sourceReadSpec(kind);
  return {
    validate: (value: unknown) => {
      const rows = resolveReadRows(value, list.rows);
      if (!rows.some(spec.eligible)) throw new Error(spec.refusal);
    },
    apply: async (value: unknown) => {
      const rows = resolveReadRows(value, list.rows);
      const outcome = await runSourceRead(dispatch, kind, rows);
      if (!outcome.ok) throw new Error(outcome.refusal);
      onRead(outcome.result);
      const text = readResultText(outcome.result);
      return {
        summary: `${spec.label}: ${outcome.result.files.length} read${
          outcome.skipped ? `, ${outcome.skipped} skipped (not a picked Google file of that kind)` : ""
        }. The person sees it in a dialog.`,
        data:
          text.length > MAX_READ_RETURN_CHARS
            ? `${text.slice(0, MAX_READ_RETURN_CHARS)}\n[…cut at ${MAX_READ_RETURN_CHARS} characters; read fewer files for the rest]`
            : text,
      };
    },
  };
}

export function createConnectedSourcesWriteHandlers(
  list: List,
  dispatch: AppDispatch,
  onRead: (result: ConnectedReadResult) => void,
): SurfaceWriteHandlers {
  return {
    read_comments: readTarget("comments", list, dispatch, onRead),
    read_history: readTarget("revisions", list, dispatch, onRead),
    read_speaker_notes: readTarget("slides", list, dispatch, onRead),
  };
}

export function createConnectedSourcesListSurface(
  getState: () => ConnectedSourcesPageState,
  dispatch: AppDispatch,
  onRead: (result: ConnectedReadResult) => void,
): EntityListSurface<ConnectedSourceRow> {
  return {
    surfaceName: CONNECTED_SOURCES_SURFACE_NAME,
    getScope: (list) => buildConnectedSourcesScope(getState(), list),
    getWriteHandlers: (list) => createConnectedSourcesWriteHandlers(list, dispatch, onRead),
  };
}
