// features/unified-data/customFieldsRead.ts
//
// THE ONE READ OF A RECORD'S CUSTOM FIELDS + VALUES, kept in the store by record
// (`custom.entity_record_read`). Two readers share it and therefore share ONE request:
//   - `EntityCustomFields` (the section on a record page) asks it before it mounts;
//   - a surface PROVIDER that owns the `custom_fields` scope value (notes) reads the same key,
//     so the agent is answered with the real values whether or not the section is on screen.
// Every value a page declares is always answered (surfaces COMPLETENESS LAW): the provider is the
// one owner; the section keeps its UI and its write doors but contributes no value on such a surface.

import { recordsDataSource } from "@ai-matrx/records-ui";
import { createClient } from "@/utils/supabase/client";
import { entityRecordReadable } from "@/features/unified-data/hub/doors";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { selectStoreRead } from "@/lib/redux/slices/storeReadsSlice";
import type { RootState } from "@/lib/redux/rootReducer";

export const recordReadableKey = (organizationId: string, token: string, recordId: string) =>
  `unified-data.record-readable:${organizationId}:${token}:${recordId}`;

/** What the read kept: "ok" with the store's whole answer, or "absent" (the pre-apply refusal). */
export type RecordReadableAnswer = { state: "ok"; record: unknown } | { state: "absent" };

let announcedUnreadable = false;

/** The section's own first read. A store refusal is never printed raw (see EntityCustomFields). */
export async function readRecordReadable(
  organizationId: string,
  token: string,
  recordId: string,
): Promise<RecordReadableAnswer> {
  let answer: Awaited<ReturnType<typeof entityRecordReadable>>;
  try {
    answer = await entityRecordReadable(recordsDataSource(createClient()), organizationId, token, recordId);
  } catch (error) {
    console.error("[EntityCustomFields] custom.entity_record_read threw", { token, recordId, error });
    throw error;
  }
  if (answer.ok) return { state: "ok", record: answer.data };
  if (answer.error.sqlstate === "42501") {
    if (!announcedUnreadable) {
      announcedUnreadable = true;
      console.warn(
        "[EntityCustomFields] custom.entity_record_read refused a column of this table (lane7w5b SQL, chair's apply); the section stays hidden on such tables until it is.",
        { token },
      );
    }
    return { state: "absent" };
  }
  console.error("[EntityCustomFields] custom.entity_record_read failed", { token, recordId, error: answer.error });
  throw new Error(answer.error.message);
}

export interface CustomFieldsScopeEntry {
  entity: string;
  record_id: string;
  fields: Array<{ name: string; key: string; type: string; value: unknown }>;
}

/** The `custom_fields` scope value from the store's answer (same shape the section's door yields). */
export function customFieldsScopeFromRecord(
  token: string,
  recordId: string,
  record: unknown,
): CustomFieldsScopeEntry[] {
  const row = (record ?? {}) as {
    fields?: Array<{ key: string; label: string; type: string; value?: unknown; hidden?: unknown }>;
    custom?: Record<string, unknown>;
  };
  const fields = Array.isArray(row.fields) ? row.fields : [];
  return [
    {
      entity: token,
      record_id: recordId,
      // A field the person may not read is left out, never shown as empty.
      fields: fields
        .filter((f) => !f.hidden)
        .map((f) => ({ name: f.label, key: f.key, type: String(f.type), value: (row.custom ?? {})[f.key] ?? f.value ?? null })),
    },
  ];
}

/** Keeps the read alive for a provider (one request per record per tab, shared with the section). */
export function useCustomFieldsRead(token: string, recordId: string | null, organizationId: string | null): void {
  useStoreRead<RecordReadableAnswer>(
    organizationId && recordId ? recordReadableKey(organizationId, token, recordId) : null,
    () => readRecordReadable(organizationId!, token, recordId!),
  );
}

/**
 * The provider's answer, read at trigger time: the record's real values once the read has landed,
 * `[]` (no fields known) before it, when the record is not persisted, or when the store keeps none.
 */
export function selectCustomFieldsScopeValue(
  state: RootState,
  token: string,
  recordId: string | null,
  organizationId: string | null,
): CustomFieldsScopeEntry[] {
  if (!organizationId || !recordId) return [];
  const entry = selectStoreRead(state, recordReadableKey(organizationId, token, recordId));
  const kept = entry?.hasData ? (entry.data as RecordReadableAnswer) : undefined;
  if (!kept || kept.state !== "ok") return [];
  return customFieldsScopeFromRecord(token, recordId, kept.record);
}
