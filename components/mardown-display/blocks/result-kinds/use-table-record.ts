"use client";

/**
 * `use-table-record` — the data half of the ONE record card for a `table:<uuid>` kind
 * (KINDS-GLUE wave 3 §5.2). `PlatformRecordBlock` draws; this reads.
 *
 *  - `useTableKind(kind)`: the Table's facts as the kind registry answered them (its live Fields,
 *    or the store's refusal), demanded on mount and repainted on every change of the kind — a
 *    Field renamed here or in another tab bumps the kind and every card of it redraws. While a
 *    card is mounted it HOLDS the kind live (`kindRegistry.holdTableKind`), which joins the
 *    Table's realtime topic through the organization's one port; record changes in the Table
 *    come back as `recordsTick`.
 *  - `useTableRecordDocument(value, tick)`: what the card shows. A value carrying Field values
 *    draws those values; a REFERENCE (`{__kind, _record_id}` and nothing else, design §5.4) is
 *    read live through the store's read door (`recordRead`, masking included) and re-read on a
 *    record change. Must be called inside the card's `RecordsProvider`.
 */

import { useEffect, useState } from "react";
import type { Field, HiddenFieldNotice, RecordDocument, TableKindFacts } from "@ai-matrx/records";
import { useRecordsClient } from "@ai-matrx/records/react";
import { kindRegistry } from "@/features/content-ir/registry/kind-registry";
import { refusalForPeople } from "@/features/content-ir/registry/table-kind-refusal";
import { useContentIrKindVersion } from "@/features/content-ir/react/use-registry-repaint";

/** The control keys a value may carry beside its Fields (wave 2 §1.4) — never columns. */
const CONTROL_KEYS = new Set(["__kind", "_record_id", "_records", "_replaces", "_new"]);

export type TableKindState =
  | { state: "loading" }
  | { state: "refused"; sentence: string }
  | {
      state: "ready";
      facts: TableKindFacts;
      /** The Table's Fields the kind draws, in the Table's order. */
      fields: Field[];
      titleKey: string | null;
      name: string | null;
    };

/**
 * One read of the registry AT a known version. The version is an argument on purpose: the
 * React Compiler memoizes on arguments, so a bumped kind re-reads (DD-215c,
 * `features/content-ir/react/registry-versioned.ts`).
 */
function readTableKindState(kind: string, version: number): TableKindState {
  void version;
  const def = kindRegistry.getDefinition(kind);
  const refusal = def?.table?.refusal;
  if (refusal) return { state: "refused", sentence: refusal };
  const facts = kindRegistry.getTableFacts(kind);
  if (!facts || !def?.schema) return { state: "loading" };
  const drawn = new Set(Object.keys(def.schema.fields).filter((key) => !CONTROL_KEYS.has(key)));
  const fields = (facts.fields as unknown as Field[]).filter((field) => drawn.has(field.key));
  return { state: "ready", facts, fields, titleKey: facts.title_field ?? null, name: facts.name ?? null };
}

export function useTableKind(kind: string): TableKindState & { recordsTick: number } {
  const version = useContentIrKindVersion(kind);
  const [recordsTick, setRecordsTick] = useState(0);

  useEffect(() => {
    kindRegistry.requestSchema(kind);
  }, [kind]);

  useEffect(
    () => kindRegistry.holdTableKind(kind, () => setRecordsTick((tick) => tick + 1)),
    [kind],
  );

  return { ...readTableKindState(kind, version), recordsTick };
}

/** The record id a reference names, when the value is a reference and nothing else. */
export function referencedRecordId(value: Record<string, unknown>): string | null {
  const id = value._record_id;
  if (typeof id !== "string" || id.trim() === "") return null;
  const valueKeys = Object.keys(value).filter((key) => !CONTROL_KEYS.has(key));
  return valueKeys.length === 0 ? id : null;
}

/** The value's Field values (control keys removed). */
export function documentOfValue(value: Record<string, unknown>): RecordDocument {
  const document: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) if (!CONTROL_KEYS.has(key)) document[key] = entry;
  return document as RecordDocument;
}

export type TableRecordDocument =
  | { state: "loading" }
  | { state: "refused"; sentence: string }
  | { state: "ready"; document: RecordDocument; hidden: Record<string, HiddenFieldNotice>; recordId: string | null };

export function useTableRecordDocument(value: Record<string, unknown>, recordsTick: number): TableRecordDocument {
  const client = useRecordsClient();
  const recordId = referencedRecordId(value);
  const [read, setRead] = useState<TableRecordDocument>({ state: "loading" });

  useEffect(() => {
    if (!recordId) return;
    let live = true;
    void client.recordRead({ record_id: recordId as never }).then((answer) => {
      if (!live) return;
      if (answer.ok) {
        setRead({ state: "ready", document: answer.data.document, hidden: answer.data.hidden ?? {}, recordId });
      } else {
        setRead({ state: "refused", sentence: refusalForPeople(answer.error.message) });
      }
    });
    return () => {
      live = false;
    };
  }, [client, recordId, recordsTick]);

  if (!recordId) {
    const id = typeof value._record_id === "string" ? value._record_id : null;
    return { state: "ready", document: documentOfValue(value), hidden: {}, recordId: id };
  }
  return read;
}
