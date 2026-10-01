"use client";

/**
 * relation-words-client — WHERE THE WORDS COME FROM.
 *
 * The store's own door for a relation column (`custom.relation_words_many`, through the data
 * seam's `readRelationWords`), which reads the column's display spec itself and asks the ladder
 * PER RECORD, so a row this reader may not open comes back as the withheld sentence and never as
 * a name or an id.
 *
 * A PAGE AT A TIME, NOT A CELL AT A TIME. One call per relation column per page of rows.
 *
 * What a reader DOES with the answer is the pure half, `relation-words.ts`.
 */

import { useEffect, useMemo, useState } from "react";

import { readRelationWords } from "./service";
import type { FieldChoice, FieldFormatConfig } from "@ai-matrx/design-system/field-formats";
import { isRelationFormat, relationIdsInColumn, type RelationWordsByField, type RelationWordsMap } from "./relation-words";

const EMPTY_WORDS: RelationWordsMap = new Map();
const EMPTY_BY_FIELD: RelationWordsByField = new Map();

/**
 * Ask the store for the words of a page of ids in one relation column.
 *
 * NOT A HOOK — a copy or an export calls this directly, which keeps it on the same path as the
 * grid. It never throws: a refusal comes back as an empty map and the caller's cells fall to the
 * amber identifier chip, which is the honest rendering of "these did not resolve" and is never a
 * blank.
 */
export async function fetchRelationWords(args: {
  tableId: string;
  fieldName: string;
  rowIds: readonly string[];
}): Promise<RelationWordsMap> {
  if (args.rowIds.length === 0) return EMPTY_WORDS;
  try {
    return await readRelationWords(args);
  } catch {
    return EMPTY_WORDS;
  }
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
  fields: readonly {
    field_name: string;
    format: FieldFormatConfig | null | undefined;
  }[],
  rows: readonly { data?: Record<string, unknown> | null }[],
  /** The table these rows belong to. */
  tableId: string,
): { choicesByField: ReadonlyMap<string, FieldChoice[]>; wordsByField: RelationWordsByField; loading: boolean } {
  // What to ask for, as a stable string, so a re-render with the same ids does
  // not re-ask. A page of forty rows changes this exactly when its ids change.
  const request = useMemo(() => {
    const out: { field: string; ids: string[] }[] = [];
    for (const f of fields) {
      if (!isRelationFormat(f.format?.id)) continue;
      const ids = relationIdsInColumn(rows, f.field_name);
      out.push({ field: f.field_name, ids });
    }
    return out;
  }, [fields, rows]);

  const key = useMemo(
    () => tableId + "|" + JSON.stringify(request),
    [request, tableId],
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
          await fetchRelationWords({ tableId, fieldName: r.field, rowIds: r.ids }),
        );
      }
      if (live) setState({ key, byField });
    })();
    return () => {
      live = false;
    };
  }, [key, request, tableId]);

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

