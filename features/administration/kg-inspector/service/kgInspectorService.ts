/**
 * features/administration/kg-inspector/service/kgInspectorService.ts
 *
 * Typed client for the read-only KG inspector backend
 * (`aidream/api/routers/kg_inspector.py`, bare prefix `/kg-inspector`).
 *
 * React → Python directly (per CLAUDE.md — no Next.js middle hop). Every
 * wire type below is DERIVED from the OpenAPI-generated contract
 * (`types/python-generated/api-types.ts`), never hand-mirrored — a backend
 * rename lights up every drifted callsite as a compile error after
 * `pnpm sync-types`. This is an admin-only forensic surface (Phase C.5) for
 * eyeballing NER entity / mention / edge data quality before the full
 * cytoscape viz (Phase G).
 */
import { apiGet, buildPath } from "@/lib/api/typed-client";
import type { components } from "@/types/python-generated/api-types";

export type KgEntityRow = components["schemas"]["EntityRow"];

export type KgEntitiesPage = components["schemas"]["EntitiesPage"];

export type KgMentionRow = components["schemas"]["MentionRow"];

export type KgMentionsPage = components["schemas"]["MentionsPage"];

export type KgEdgeRow = components["schemas"]["EdgeRow"];

export type KgEdgesTop = components["schemas"]["EdgesTop"];

export interface ListEntitiesParams {
  organizationId?: string | null;
  kind?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
}

export async function listKgEntities(
  params: ListEntitiesParams = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgEntitiesPage> {
  const { data } = await apiGet("/kg-inspector/entities", {
    signal: opts.signal,
    query: {
      organization_id: params.organizationId,
      kind: params.kind,
      q: params.q,
      limit: params.limit ?? 50,
      offset: params.offset ?? 0,
    },
  });
  return data;
}

export async function listKgEntityMentions(
  entityId: string,
  params: { limit?: number; offset?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgMentionsPage> {
  const { data } = await apiGet(
    buildPath("/kg-inspector/entities/{entity_id}/mentions", {
      entity_id: entityId,
    }),
    {
      signal: opts.signal,
      query: { limit: params.limit ?? 50, offset: params.offset ?? 0 },
    },
  );
  return data;
}

export async function listKgTopEdges(
  params: { organizationId?: string | null; kind?: string | null; limit?: number } = {},
  opts: { signal?: AbortSignal } = {},
): Promise<KgEdgesTop> {
  const { data } = await apiGet("/kg-inspector/edges/top", {
    signal: opts.signal,
    query: {
      organization_id: params.organizationId,
      kind: params.kind,
      limit: params.limit ?? 50,
    },
  });
  return data;
}
