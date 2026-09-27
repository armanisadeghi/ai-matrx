/**
 * features/knowledge/hub/triage/triageApi.ts — the ONE client for personal
 * triage (KNOWLEDGE-HUB §4: Inbox → kept → archived, per person).
 *
 *   triage_items(state, limit, cursor)       → what sits in my Inbox / Kept /
 *                                              Archived, access re-checked per row
 *   set_triage_state(token, id, state)       → move one record (refuses ids I
 *                                              cannot open, in its own sentence)
 *
 * Both are `platform` SECURITY DEFINER doors called DIRECT from the browser
 * (no server hop for a plain read/write). A refusal is thrown as an Error
 * carrying the server's own sentence, never a generic one.
 */

import { supabase } from "@/utils/supabase/client";
import type { KnowledgeHit, TriageState } from "@/features/knowledge/api/knowledgeSearch";

export const TRIAGE_STATES: readonly TriageState[] = ["inbox", "kept", "archived"];

export const TRIAGE_LABEL: Record<TriageState, string> = {
  inbox: "Inbox",
  kept: "Kept",
  archived: "Archived",
};

/** Largest page the door hands out; a count at this size reads "200+". */
export const TRIAGE_PAGE_MAX = 200;

export interface TriagePage {
  hits: KnowledgeHit[];
  nextCursor: string | null;
}

interface TriageRow {
  entity_token: string;
  entity_id: string;
  title: string | null;
  subtitle: string | null;
  organization_id: string | null;
  source_kind: string | null;
  origin_client: string | null;
  triage_state: string | null;
  filed_at: string | null;
  next_cursor: string | null;
}

/** The server's sentence, or a plain one naming what failed. */
export function refusalMessage(error: unknown, what: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return `${what} failed and the server gave no reason.`;
}

export function triageRowToHit(r: TriageRow): KnowledgeHit {
  const state = TRIAGE_STATES.includes(r.triage_state as TriageState) ? (r.triage_state as TriageState) : null;
  return {
    entity: r.entity_token,
    id: r.entity_id,
    title: r.title?.trim() || "Untitled",
    // The projection often carries the Source kind as the subtitle; that is not a snippet.
    snippet: r.subtitle && r.subtitle !== r.source_kind ? r.subtitle : null,
    organization_id: r.organization_id,
    source_kind: r.source_kind,
    origin: r.origin_client,
    triage_state: state,
    updated_at: r.filed_at,
  };
}

export async function listTriage(
  state: TriageState,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<TriagePage> {
  const { data, error } = await supabase.schema("platform").rpc("triage_items", {
    p_state: state,
    p_limit: opts.limit ?? 50,
    ...(opts.cursor ? { p_cursor: opts.cursor } : {}),
  });
  if (error) throw new Error(refusalMessage(error, `Reading your ${TRIAGE_LABEL[state]}`));
  const rows = (Array.isArray(data) ? data : []) as TriageRow[];
  return {
    hits: rows.map(triageRowToHit),
    nextCursor: rows.find((r) => r.next_cursor)?.next_cursor ?? null,
  };
}

/** How many items sit in a state: exact up to 200, then "200+". */
export async function countTriage(state: TriageState): Promise<{ count: number; more: boolean }> {
  const page = await listTriage(state, { limit: TRIAGE_PAGE_MAX });
  return { count: page.hits.length, more: page.nextCursor !== null };
}

export async function setTriageState(entityToken: string, entityId: string, state: TriageState): Promise<void> {
  const { error } = await supabase.schema("platform").rpc("set_triage_state", {
    p_entity_token: entityToken,
    p_entity_id: entityId,
    p_state: state,
  });
  if (error) throw new Error(refusalMessage(error, `Moving it to ${TRIAGE_LABEL[state]}`));
}
