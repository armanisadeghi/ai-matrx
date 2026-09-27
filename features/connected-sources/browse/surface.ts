// features/connected-sources/browse/surface.ts
//
// The `matrx-user/connected-sources` runtime: ONE pure state → scope mapper.
// It reads what the page already rendered (the adapter list, the chosen
// account, the list controller, the server's last sentence) and never fetches.
// No write half: every row lives in someone else's account and this page only
// reads it (see the manifest header).

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
import type { ConnectedAdapterRow, ConnectedSourceRow } from "../types";

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
        }
      : {}),
    ...(state.summary && list ? { browse_summary: state.summary } : {}),
    ...(loadError ? { load_error: loadError } : {}),
  });
}

export function createConnectedSourcesListSurface(
  getState: () => ConnectedSourcesPageState,
): EntityListSurface<ConnectedSourceRow> {
  return {
    surfaceName: CONNECTED_SOURCES_SURFACE_NAME,
    getScope: (list) => buildConnectedSourcesScope(getState(), list),
  };
}
