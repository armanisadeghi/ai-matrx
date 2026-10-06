/**
 * A TABLE IS A KIND — the web half (KINDS-GLUE wave 3 slice 4, design §1.4).
 *
 * `table:<uuid>` names "a record of that Table". It is never a `kind_definition` row: the kind
 * registry answers it from the Table's live Fields, read through the store's own door
 * `custom.table_kind_facts` (`@ai-matrx/records` `tableKindFacts`) AS THE PERSON LOOKING, and
 * draws it with `tableRenderSchema` wrapped by wave 2's `withControlKeyFields`.
 *
 * This module is imported ONLY through the registry's dynamic `import()` the first time a
 * `table:` slug is sighted — a session that never meets a table kind never loads the records
 * client, the realtime port or this file (THE ZERO-PREFETCH LAW, kind-registry.ts header).
 *
 * LIVE. `joinTableLive` joins `custom:table:<id>` for the Table and every options Table its
 * choice Fields read, through the ONE realtime port per organization
 * (`createRecordsRealtimePort`, memoized there). A Field notice (`shape`) or a record change in an
 * options Table (a choice is a record) re-reads the facts; a record change in the Table itself is
 * handed to the cards so a dropped reference re-reads its record. When the organization's store
 * switch is off the port subscribes nothing and says so; the registry's 30 s lease is then the
 * only refresh.
 */

import {
  onTableStructureChanged,
  tableKindFacts,
  tableRenderSchema,
  type TableKindFacts,
} from "@ai-matrx/records/core";
import {
  withControlKeyFields,
  type KindSchema,
  type TableKindFacet,
} from "@ai-matrx/content-ir";
import { createClient } from "@/utils/supabase/client";
import { refusalForPeople } from "./table-kind-refusal";
import { createRecordsRealtimePort } from "@ai-matrx/records/realtime";

export type TableKindAnswer =
  | { ok: true; facts: TableKindFacts; schema: KindSchema; facet: TableKindFacet }
  | { ok: false; facet: TableKindFacet };

/** The Tables whose records are this Table's choices. */
export function optionsTableIdsOf(facts: TableKindFacts): string[] {
  const ids = new Set<string>();
  for (const field of facts.fields ?? []) {
    const config = field.config;
    const id =
      (typeof field.options_table_id === "string" && field.options_table_id) ||
      (config && typeof config === "object" && typeof (config as Record<string, unknown>).options_table_id === "string"
        ? ((config as Record<string, unknown>).options_table_id as string)
        : null);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Read one Table as a kind, as the signed-in person. Never throws. */
export async function readTableKind(_kind: string, tableId: string): Promise<TableKindAnswer> {
  const answer = await tableKindFacts(createClient(), tableId);
  if (!answer.ok) {
    return {
      ok: false,
      facet: {
        tableId,
        organizationId: null,
        name: null,
        titleField: null,
        stamp: null,
        fieldIds: [],
        optionsTableIds: [],
        refusal: refusalForPeople(answer.error.message),
      },
    };
  }
  const facts = answer.data;
  // THE CALLER WRAPS (design §2.4a): records cannot depend on content-ir, so the control keys
  // (`_record_id`, `_records`, `_replaces`, `_new`) are added here — without the wrap a reference
  // or a batch loses its key to the parser's residue. Guard 5 (b3) plants dropping it.
  const schema = withControlKeyFields(tableRenderSchema(facts) as unknown as KindSchema);
  return {
    ok: true,
    facts,
    schema,
    facet: {
      tableId,
      organizationId: facts.organization_id ?? null,
      name: facts.name ?? null,
      titleField: facts.title_field ?? null,
      stamp: facts.stamp ?? null,
      fieldIds: (facts.fields ?? []).map((f) => String(f.id ?? "")).filter(Boolean),
      optionsTableIds: optionsTableIdsOf(facts),
      refusal: null,
    },
  };
}

/**
 * Join the Table and its options Tables on the organization's one realtime port.
 * Returns the leave function.
 */
export function joinTableLive(
  organizationId: string,
  tableId: string,
  optionsTableIds: readonly string[],
  on: { shape: () => void; records: (ids: readonly string[] | null) => void },
): () => void {
  const port = createRecordsRealtimePort();
  const stops: Array<() => void> = [];
  stops.push(
    port.subscribeRecords(
      { organization_id: organizationId as never, table_id: tableId as never },
      { shape: on.shape, records: (ids) => on.records(ids as readonly string[] | null) },
    ),
  );
  for (const optionsTableId of optionsTableIds) {
    if (optionsTableId === tableId) continue;
    // A choice is a record of the options Table: any change there is a change of this kind.
    stops.push(
      port.subscribeRecords(
        { organization_id: organizationId as never, table_id: optionsTableId as never },
        { shape: on.shape, records: () => on.shape() },
      ),
    );
  }
  return () => {
    for (const stop of stops) stop();
  };
}

/** This page's own structure changes (a rename in /data in the same tab). */
export function hearTableStructure(listener: (tableId: string | null) => void): () => void {
  return onTableStructureChanged(listener);
}
