// features/kg-suggestions/service/kgEnrichmentService.ts
//
// Turns a raw KG suggestion row (which only carries opaque ids) into the
// human-readable picture the decision UI needs:
//   - the TARGET: org → scope-type → scope → item path, every item on the
//     scope, and the current value each holds (resolved through the scopes
//     chokepoint, `scopesService.resolveSuggestionTarget`).
//   - the SOURCE: a readable title for the note/task/… the entity came from,
//     plus whether it can be opened in a window panel.
//
// Read-only. Lives outside the scopes chokepoint because it only orchestrates
// the chokepoint's read method + a notes/title lookup; it never touches ctx_*
// tables directly.

"use client";

import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { fetchNoteById } from "@/features/notes/service/notesService";
import type { ResolvedSuggestionTarget } from "@/features/scopes/types";
import type { KgSuggestionRow } from "@/features/kg-suggestions/types";

/** Source kinds we can open in a floating window panel from the decision UI. */
export type KgOpenableSourceKind = "note";

export interface EnrichedSuggestionSource {
  kind: string;
  id: string;
  /** Readable title, or null when we couldn't resolve one. */
  title: string | null;
  /** When set, the source can be opened in a window panel of this kind. */
  openableAs: KgOpenableSourceKind | null;
}

export interface EnrichedSuggestion {
  /** Resolved target path + items + current values, or null on failure. */
  target: ResolvedSuggestionTarget | null;
  source: EnrichedSuggestionSource;
}

const OPENABLE: Record<string, KgOpenableSourceKind> = {
  note: "note",
};

async function resolveSourceTitle(
  kind: string,
  id: string,
): Promise<string | null> {
  try {
    if (kind === "note") {
      const note = await fetchNoteById(id);
      return note?.label?.trim() || "Untitled note";
    }
  } catch {
    // fall through to null — the UI shows kind + id as a graceful fallback.
  }
  return null;
}

/**
 * Enrich one suggestion row. Heavy-hitter rows have no slot-fill target, so
 * `target` resolution is skipped for them (the source is still resolved).
 */
export async function enrichSuggestion(
  row: KgSuggestionRow,
): Promise<EnrichedSuggestion> {
  const source: EnrichedSuggestionSource = {
    kind: row.source_kind,
    id: row.source_id,
    title: null,
    openableAs: OPENABLE[row.source_kind] ?? null,
  };

  const [title, target] = await Promise.all([
    resolveSourceTitle(row.source_kind, row.source_id),
    resolveTarget(row),
  ]);

  source.title = title;
  return { target, source };
}

async function resolveTarget(
  row: KgSuggestionRow,
): Promise<ResolvedSuggestionTarget | null> {
  if (row.match_kind === "heavy_hitter") return null;
  const scopeId = row.target.scope_id;
  if (!scopeId) return null;
  const res = await scopesService.resolveSuggestionTarget({
    scopeId,
    contextItemId: row.target.scope_item_id,
  });
  if (isScopesRpcErr(res)) return null;
  return res.data;
}
