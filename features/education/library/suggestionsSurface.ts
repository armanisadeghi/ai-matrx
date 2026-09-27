// features/education/library/suggestionsSurface.ts
//
// The `matrx-user/education-library-suggestions` surface for
// /education/library/suggestions: the scope (from what OwnerSuggestionInbox
// already holds; never a fetch) and the pure parser for `update_suggestions`.

import {
  createEducationLibrarySuggestionsScope,
  type SuggestionFullRow,
} from "@/features/surfaces/manifests/education-library-suggestions.manifest";
import {
  readCollectionList,
  refuseRepeats,
} from "@/features/surfaces/runtime/collection-write-targets";
import type { DeckSuggestionRow } from "./types";

const INLINE_ROWS = 25;
const LIST_BODY_CHARS = 200;

export function buildSuggestionsInboxScope(input: {
  rows: DeckSuggestionRow[] | null;
  error: string | null;
}) {
  if (input.error)
    return createEducationLibrarySuggestionsScope({
      inbox_state: "failed",
      inbox_error: input.error,
    });
  if (input.rows === null)
    return createEducationLibrarySuggestionsScope({ inbox_state: "loading" });
  const full = input.rows.map(
    (s): SuggestionFullRow => ({
      id: s.id,
      deck_id: s.resource_id,
      resource_type: s.resource_type,
      status: s.status,
      body: s.body,
      created_at: s.created_at,
      resolved_at: s.resolved_at,
    }),
  );
  return createEducationLibrarySuggestionsScope({
    inbox_state: "ready",
    suggestion_list: full.slice(0, INLINE_ROWS).map((s) => ({
      id: s.id,
      deck_id: s.deck_id,
      status: s.status,
      body:
        s.body.length > LIST_BODY_CHARS
          ? `${s.body.slice(0, LIST_BODY_CHARS)}…`
          : s.body,
      created_at: s.created_at,
    })),
    suggestion_count: full.length,
    open_suggestion_count: full.filter((s) => s.status === "open").length,
    suggestion_rows: full,
  });
}

export interface SuggestionAnswerPlan {
  row: DeckSuggestionRow;
  status: "accepted" | "declined";
}

/** `update_suggestions`: a list of `{ id, status }` over OPEN suggestions. */
export function parseUpdateSuggestionsValue(
  value: unknown,
  rows: readonly DeckSuggestionRow[] | null,
): SuggestionAnswerPlan[] {
  if (rows === null)
    throw new Error(
      "update_suggestions: the inbox has not loaded yet (inbox_state is not \"ready\"). Nothing was changed.",
    );
  const list = readCollectionList("update_suggestions", "suggestions", value);
  const plan = list.map((item, i) => {
    const where = `update_suggestions[${i}]`;
    if (item === null || typeof item !== "object" || Array.isArray(item))
      throw new Error(
        `${where} must be an object { id, status }; received ${JSON.stringify(item)}.`,
      );
    const record = item as Record<string, unknown>;
    const extra = Object.keys(record).filter((k) => k !== "id" && k !== "status");
    if (extra.length)
      throw new Error(`${where} does not accept ${extra.join(", ")}. Allowed keys: id, status.`);
    const row = rows.find((r) => r.id === record.id);
    if (!row)
      throw new Error(
        `${where}.id ${JSON.stringify(record.id)} is not a suggestion in this inbox. Use an id from suggestion_list. Nothing was changed.`,
      );
    const status = String(record.status ?? "").trim().toLowerCase();
    if (status !== "accepted" && status !== "declined")
      throw new Error(
        `${where}.status must be "accepted" or "declined"; received ${JSON.stringify(record.status)}.`,
      );
    if (row.status !== "open")
      throw new Error(
        `${where}: suggestion ${row.id} is already ${row.status}; only open suggestions can be answered. Nothing was changed.`,
      );
    return { row, status: status as "accepted" | "declined" };
  });
  refuseRepeats(
    "update_suggestions",
    plan.map((p) => p.row.id),
    "suggestion",
  );
  return plan;
}
