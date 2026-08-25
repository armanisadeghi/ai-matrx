/**
 * The tabular kind family — the compiled parser mirror (Table Kinds Run, Stage B).
 *
 * PYTHON-OWNED: the registry row is seeded from the pydantic model in
 * `aidream/aidream/services/table_kinds/models.py` (the source of truth,
 * distilled 2026-08-24 from 12 REAL captures across five producers). The
 * `KindSchema` below is the FE parser's mirror of that model; the generated TS
 * types live in `kinds/generated/kinds.generated.ts` (`pnpm shape:types` —
 * registry→TS codegen). A model change re-publishes the registry
 * (`scripts/publish_kind_catalog.py aidream.services.table_kinds.models
 * --evolve --apply`) AND regenerates the types AND updates this mirror in the
 * same change.
 *
 * ONE KIND, ON PURPOSE. `data_table` is a PRIMITIVE — the highest-reuse kind in
 * the data-to-kinds queue. A SQL result, a user data-table lookup, a parsed CSV
 * and a table lifted out of a PDF are the same rows-and-columns shape that was
 * wearing five different names, agreeing on NO field: `rows` was a list of
 * dicts / a list of `{row_id,data}` / objects-or-value-lists / a list of string
 * arrays, `columns` was absent / absent / sometimes-empty / a heuristic, and of
 * the four "row counts" three meant DATA rows while the PDF one counted the
 * header row too. Everything that returns rows nests THIS instead of minting
 * its own.
 *
 * 🚨 CUTOVER-GATED SIBLINGS — deliberately NOT mirrored here. `sql_query_result`,
 * `table_rows` and `pdf_table_extraction` gain an optional `table: data_table`
 * projection in the Python models, but their registry rows still hold the
 * PRE-supersede schema and the supersede is BREAKING (measured by the
 * compatibility gate: the live `rows` item schema declares a `__kind` slot a
 * plain dict does not). They ride Stage D with the emitter repoint and keep the
 * `generic_structured` floor until then — same posture as `web_search_results`
 * in `search-results.ts` and `seo_rank_serp_landscape` in `rank-kinds.ts`.
 *
 * ROWS ARE POSITIONAL — `rows[i][j]` aligns to `columns[j]`. That is the one
 * representation every producer can supply honestly: a headerless CSV has cells
 * but no names, and forcing objects would mean inventing `col_1`, `col_2` —
 * names no source ever gave. `json[]` is the correct field type: each item is
 * an opaque JSON value (here, an array of cells), so the parser never tries to
 * kind-identify a row.
 *
 * The bridge is the search family's: ONE uniform `{ value, isComplete }`
 * streaming wrapper (never a second copy). The component owns all reading
 * defensively — a half-arrived table is a NORMAL state.
 */

import type { KindDefinition, KindSchema } from "@ai-matrx/content-ir";
import { makeSearchKindBridge } from "./search-results";

export const dataTableKindSchema: KindSchema = {
  kind: "data_table",
  fields: {
    // Plain sub-structure, not a registered kind: `DataColumn`
    // ({name, type?, nullable?, source_type?, description?}) has no independent
    // identity — a column outside its table is nothing.
    columns: {
      type: "json[]",
      description:
        "Declared columns, in order. Present even when there are zero rows — " +
        "an empty result that still describes its schema is a real, meaningful " +
        "state. Each item is {name, type?, nullable?, source_type?, description?}.",
    },
    rows: {
      type: "json[]",
      description:
        "Data rows, POSITIONAL, aligned to `columns`. Each item is an array of " +
        "cells. Rows are NOT forced to the column count — ragged rows are real " +
        "(PDF extraction produces them) and a renderer pads rather than dropping.",
    },
    row_count: {
      type: "number",
      description:
        "How many DATA rows this table carries. The header is never one of them.",
    },
    total_row_count: {
      type: "number",
      nullable: true,
      description:
        "How many rows EXIST at the source, when known and different from " +
        "`row_count`. This is what makes '500 of 40,000' sayable.",
    },
    truncated: {
      type: "boolean",
      description:
        "Whether rows were cut off. Never left to be inferred — four producers " +
        "capped their rows silently and a reader had no way to know.",
    },
    truncated_at: {
      type: "number",
      nullable: true,
      description: "The limit that did the cutting, when there was one.",
    },
    title: { type: "string", nullable: true },
    // TableSource is plain sub-structure too — provenance about a table, with
    // no life of its own.
    source: {
      type: "inline_object",
      nullable: true,
      fields: {
        origin: {
          type: "string",
          nullable: true,
          description: "sql | data_table | csv | pdf | office | api.",
        },
        schema_name: { type: "string", nullable: true },
        table_name: { type: "string", nullable: true },
        table_id: { type: "string", nullable: true },
        query: { type: "string", nullable: true },
        file_id: { type: "string", nullable: true },
        page_number: { type: "number", nullable: true },
        table_index: { type: "number", nullable: true },
        detector: { type: "string", nullable: true },
        detector_version: { type: "string", nullable: true },
      },
    },
    notes: {
      type: "string[]",
      description:
        "Honest caveats a reader needs: a heuristic header, ragged rows, a " +
        "lossy numeric coercion, an INFERRED truncation. Empty is a claim that " +
        "there are none — so they are surfaced, never swallowed.",
    },
  },
};

export const TABLE_KINDS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "data_table",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "data_table",
    toLegacyServerData: makeSearchKindBridge("data_table"),
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: dataTableKindSchema,
  },
];
