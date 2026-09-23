"use client";

/**
 * relation-words-client — WHERE THE WORDS COME FROM.
 *
 * `workbench.udt_row_words_many(organization_id, display, row_ids)` — the OLDER
 * store's own door, landed by lane OLD-TABLES-2 (W2). It is NOT
 * `custom._words_for`: that body sits behind thirteen live screens of the
 * unified store and a second store's ladder does not belong inside it. The door
 * asks the ladder PER RECORD, against both arms of
 * `workbench.udt_dataset_rows`'s own select policy, so a row this reader may
 * not open comes back as the withheld sentence and never as a name or an id.
 *
 * A PAGE AT A TIME, NOT A CELL AT A TIME. One call per relation column per page
 * of rows. The door memoises the expensive half of the ladder per statement, so
 * forty cells cost one round trip and one ladder walk.
 *
 * What a reader DOES with the answer is the pure half, `relation-words.ts`.
 */

import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/utils/supabase/client";
import { relationWords as recordStoreRelationWords } from "./data-source/record-store";
import { recordStoreHomeOf } from "./data-source/table-home";
import type { FieldChoice, FieldFormatConfig } from "@/lib/field-formats/types";
import { isRelationFormat, relationIdsInColumn, type RelationWordsByField, type RelationWordsMap } from "./relation-words";

const EMPTY_WORDS: RelationWordsMap = new Map();
const EMPTY_BY_FIELD: RelationWordsByField = new Map();

/**
 * Ask the older store's door for a page of ids.
 *
 * NOT A HOOK — the non-React readers (`@table_cell`, an export, a server route)
 * call this directly, which is what keeps them on the same path as the grid.
 * It never throws: a refusal comes back as an empty map and the caller's cells
 * fall to the amber identifier chip, which is the honest rendering of "these
 * did not resolve" and is never a blank.
 */
export async function fetchRelationWords(args: {
  organizationId: string | null | undefined;
  /** The column's own `metadata.format.options.display`, passed through untouched. */
  display?: unknown;
  rowIds: readonly string[];
  /**
   * The table and the column the cells are in. A table the RECORD STORE holds
   * (`data-source/table-home.ts`) resolves its words through the store's own
   * door for that column (`custom.relation_words_many`), which reads the
   * column's display spec itself; an older table ignores both.
   */
  tableId?: string | null;
  fieldName?: string | null;
}): Promise<RelationWordsMap> {
  const { organizationId, display, rowIds } = args;
  if (rowIds.length === 0) return EMPTY_WORDS;
  const home = recordStoreHomeOf(args.tableId);
  if (home && args.tableId && args.fieldName) {
    return recordStoreRelationWords(home, { tableId: args.tableId, fieldName: args.fieldName, rowIds });
  }
  if (!organizationId) return EMPTY_WORDS;

  const { data, error } = await supabase
    .schema("workbench")
    .rpc("udt_row_words_many", {
      p_organization_id: organizationId,
      // NULL, never undefined: undefined disappears from the JSON body and
      // PostgREST then cannot resolve the three-argument overload. Null is a
      // real answer — "this table's own row label".
      p_display: display ?? null,
      p_row_ids: [...rowIds],
    });

  if (error || !Array.isArray(data)) return EMPTY_WORDS;

  const out = new Map<string, string>();
  for (const row of data as { row_id?: string; words?: string | null }[]) {
    if (row?.row_id && typeof row.words === "string") out.set(row.row_id, row.words);
  }
  return out;
}

/**
 * The words for every `relation` column of one table's current page, as choice
 * options the existing choice system already knows how to draw.
 *
 * `{ value: <the stored id>, label: <the words> }` is exactly the shape a
 * `person` column has used since 2026-09-21 — the cell stores the identifier,
 * the chip shows the name, the filter checklist filters by the value and
 * displays the label, and a write still sends the value. `relation` joins that
 * path rather than inventing a second one.
 */
export function useRelationWordsFor(
  organizationId: string | null | undefined,
  fields: readonly {
    field_name: string;
    format: FieldFormatConfig | null | undefined;
  }[],
  rows: readonly { data?: Record<string, unknown> | null }[],
  /** The table these rows belong to — see `fetchRelationWords`. */
  tableId?: string | null,
): { choicesByField: ReadonlyMap<string, FieldChoice[]>; wordsByField: RelationWordsByField; loading: boolean } {
  // What to ask for, as a stable string, so a re-render with the same ids does
  // not re-ask. A page of forty rows changes this exactly when its ids change.
  const request = useMemo(() => {
    const out: { field: string; display: unknown; ids: string[] }[] = [];
    for (const f of fields) {
      if (!isRelationFormat(f.format?.id)) continue;
      const ids = relationIdsInColumn(rows, f.field_name);
      out.push({
        field: f.field_name,
        display: (f.format?.options as Record<string, unknown> | undefined)?.display ?? null,
        ids,
      });
    }
    return out;
  }, [fields, rows]);

  const key = useMemo(
    () => (organizationId ?? "") + "|" + (tableId ?? "") + "|" + JSON.stringify(request),
    [organizationId, request, tableId],
  );

  const [state, setState] = useState<{ key: string; byField: Map<string, RelationWordsMap> } | null>(null);

  useEffect(() => {
    if (request.length === 0) {
      setState({ key, byField: new Map() });
      return;
    }
    let live = true;
    void (async () => {
      const byField = new Map<string, RelationWordsMap>();
      for (const r of request) {
        byField.set(
          r.field,
          await fetchRelationWords({ organizationId, display: r.display, rowIds: r.ids, tableId, fieldName: r.field }),
        );
      }
      if (live) setState({ key, byField });
    })();
    return () => {
      live = false;
    };
  }, [key, organizationId, request, tableId]);

  const wordsByField: RelationWordsByField = state?.key === key ? state.byField : EMPTY_BY_FIELD;

  const choicesByField = useMemo(() => {
    const out = new Map<string, FieldChoice[]>();
    for (const r of request) {
      const words = wordsByField.get(r.field);
      const choices: FieldChoice[] = [];
      for (const id of r.ids) {
        const w = words?.get(id);
        if (typeof w === "string") choices.push({ value: id, label: w });
      }
      out.set(r.field, choices);
    }
    return out;
  }, [request, wordsByField]);

  return {
    choicesByField,
    wordsByField,
    loading: request.length > 0 && state?.key !== key,
  };
}

