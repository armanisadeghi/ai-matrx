// features/scopes/registry/entityContentAdapters.ts
//
// HOW AN AGENT REACHES AN ENTITY'S CONTENT — the canonical per-token access
// map, sibling of `entityRegistry.ts` (display/query) and consumed by any
// surface that tells an agent "here is what's attached, and here is how you
// read it" (war-room context roster, future surfaces).
//
// Two parts per token:
//   • `accessHint` — the one-line instruction rendered into the agent's
//     context legend. SERVER tools are preferred (no client suspend):
//     `data` / `data_action` / `document` / `workbook` / `rag_search`.
//   • `read?` — a client-delegated reader for tokens the server registry
//     does NOT cover (conversation history, working documents, datasets…).
//     RLS-scoped supabase reads; used by the generic `war_room_read_resource`
//     tool. Absent `read` = "server tool covers it".
//
// Registry-driven end to end: a token with no entry gets the DEFAULT hint
// (the generic reader), so newly registered types are reachable with zero
// code here.

import { supabase } from "@/utils/supabase/client";
import { tryGetEntityInfo } from "./entityRegistry";

export type EntityContentResult =
  | { ok: true; content: string; meta?: Record<string, unknown> }
  | { ok: false; error: string };

export interface EntityContentReadOpts {
  /** Token-specific mode (e.g. file text "clean" | "raw"). */
  mode?: string;
  /** Truncate content to this many characters (default 20 000). */
  maxChars?: number;
}

export interface EntityContentAdapter {
  token: string;
  /** One-line access instruction for the agent context legend. */
  accessHint: string;
  /** Client-side reader for tokens server tools don't cover. */
  read?: (id: string, opts?: EntityContentReadOpts) => Promise<EntityContentResult>;
}

/** The fallback hint for any registered token without a bespoke entry. */
export const DEFAULT_ACCESS_HINT =
  "war_room_read_resource(entity_type, entity_id)";

const ADAPTERS: Record<string, EntityContentAdapter> = {};

function register(adapter: EntityContentAdapter): void {
  ADAPTERS[adapter.token] = adapter;
}

export function getEntityContentAdapter(
  token: string,
): EntityContentAdapter | null {
  return ADAPTERS[token] ?? null;
}

/**
 * Hint for one token — bespoke entry, else the generic reader (only for
 * registered tokens; unknown tokens return null).
 */
export function accessHintFor(token: string): string | null {
  const adapter = ADAPTERS[token];
  if (adapter) return adapter.accessHint;
  return tryGetEntityInfo(token) ? DEFAULT_ACCESS_HINT : null;
}

/** Legend rows for the tokens actually present on a surface (deduped). */
export function accessLegendEntries(
  tokens: Iterable<string>,
): { token: string; hint: string }[] {
  const out: { token: string; hint: string }[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    const hint = accessHintFor(token);
    if (hint) out.push({ token, hint });
  }
  return out;
}

// ─── Generic fallback reader ────────────────────────────────────────────────

const DEFAULT_MAX_CHARS = 20_000;

/** Columns never worth an agent's window (vectors, search indexes). */
const NOISE_COLUMNS = /embedding|search_vector|tsv/i;

/**
 * RLS-scoped generic row read via the registry (schema/table). The safety net
 * that makes EVERY registered token readable even before it has a bespoke
 * adapter or server coverage.
 */
export async function readEntityRowGeneric(
  token: string,
  id: string,
  opts?: EntityContentReadOpts,
): Promise<EntityContentResult> {
  const info = tryGetEntityInfo(token);
  if (!info) return { ok: false, error: `Unknown entity type "${token}"` };
  const db = (
    info.schema && info.schema !== "public"
      ? supabase.schema(info.schema as "files")
      : supabase
  ) as typeof supabase;
  const { data, error } = await db
    .from(info.table as never)
    .select("*")
    .eq("id" as never, id as never)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Not found or not accessible" };
  const row = Object.fromEntries(
    Object.entries(data as Record<string, unknown>).filter(
      ([k]) => !NOISE_COLUMNS.test(k),
    ),
  );
  const max = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const json = JSON.stringify(row, null, 1);
  return {
    ok: true,
    content: json.length > max ? `${json.slice(0, max)}…` : json,
    meta: { token, id, truncated: json.length > max },
  };
}

// ─── Bespoke hints (server-covered tokens — no client reader needed) ────────

register({
  token: "data_store",
  accessHint:
    "SEARCH it with rag_search(query, data_store_id=<id>) — the store scopes retrieval",
});
register({
  token: "file",
  accessHint:
    'file_read(file_id=<id>) to read its extracted text (mode/page_start/page_end/max_chars to scope it); rag_search(source_ids=[<id>]) to search (rag="indexed" only)',
});
register({
  token: "note",
  accessHint: 'data tool (resource_type "note", id) — read or edit',
});
register({
  token: "task",
  accessHint: 'data tool (resource_type "task", id) — read or edit',
});
register({
  token: "project",
  accessHint: 'data tool (resource_type "project", id)',
});
register({
  token: "transcript",
  accessHint: 'data tool (resource_type "transcript", id)',
});
register({
  token: "studio_session",
  accessHint:
    'data tool (resource_type "studio_session", id) — recordings + transcript',
});
register({
  token: "udt_document",
  accessHint: "document tool (document id) — read or edit",
});
register({
  token: "workbook",
  accessHint: "workbook tool (workbook id)",
});
register({
  token: "conversation",
  accessHint:
    "war_room_read_thread(thread_id) for a thread's chain; war_room_read_resource(entity_type='conversation', entity_id=<id>) for any attached conversation",
});
