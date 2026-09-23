// features/masterwork/browse/lookalikeRulebooks.ts
//
// TWO RULEBOOKS MAY CARRY ONE NAME — AND THE LIST SAYS WHICH IS WHICH.
//
// Cold walk 21 (defect D): `/masterwork/all` showed three rows all reading
// `walk21-Repaint or Recoat Verdict` with nothing on the row to tell them
// apart. Allowing the duplicate is the ruling (Notion and Linear both allow
// it, and the create door reports `name_already_in_use` rather than refusing);
// disambiguating the rows is the other half of allowing it.
//
// The arithmetic is the shared `lib/entity-list/lookalikes` primitive so every
// list on `EntityListPage` inherits it; this file only says what a Rulebook's
// distinguishing facts are — when it was started, and what it was built from.

import {
  lookalikeNotesFor,
  type LookalikeSpec,
} from "@/lib/entity-list/lookalikes";
import type { RulebookListRow } from "../types";
import { formatSourceSummary } from "./sourceSummary";

/**
 * A Rulebook's distinguishing facts — ONE spec, read by the table (through
 * `rulebookListConfig.lookalike`) and by the card and row views (below), so
 * every view tells twins apart by the same rule and in the same words.
 */
export const RULEBOOK_LOOKALIKE: LookalikeSpec<RulebookListRow> = {
  createdAt: (row) => row.created_at,
  detail: (row) => formatSourceSummary(row.sources) ?? row.source.author ?? null,
  startedWord: "Started",
};

/**
 * The note that tells a Rulebook apart from the same-named Rulebooks beside
 * it on this page, keyed by id. Rows with a unique name are absent.
 */
export function rulebookLookalikeNotes(
  rows: readonly RulebookListRow[],
): Map<string, string> {
  return lookalikeNotesFor(
    rows,
    (row) => row.id,
    (row) => row.name,
    RULEBOOK_LOOKALIKE,
  );
}
