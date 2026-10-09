"use client";

// features/unified-data/standard-field-columns/useStandardFieldColumns.tsx
//
// THE ONE COLUMN SOURCE FOR CUSTOM FIELDS ON A STANDARD LIST (lane 7, wave 2).
//
//   const custom = useStandardFieldColumns<PartyListRow>("party", ctx?.orgIds);
//   <MatrxDataTable columns={[...PARTY_COLUMNS, ...custom.columns]} grouping={…custom.groupable…} />
//
// A list names its registry token and the organizations it spans; this hands back the
// MatrxDataTable column definitions (hidden until the person picks them in Columns), the merged
// field list the list's service needs for its server predicates, and the group-by words.
// Definitions come through the store's own door (`custom.entity_fields_across`: ONE call for
// every organization the list spans, Fields and choices together, as the person) — never a
// direct read of the field registry — and only fields the
// seat may read become columns (see ./standardFieldColumns.ts § THE FIELD RULE).
//
// The organizations are the ones the LIST spans (the person's memberships), never the active
// organization (law: the active organization is never a list filter).

import { useEffect, useMemo, useState } from "react";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { createRecordsClient } from "@ai-matrx/records/core";
import { optionKey, optionLabel } from "@ai-matrx/records";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import { createClient } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  columnIdFor,
  displayCustomValue,
  keyOfColumnId,
  mergeFieldDefinitions,
  optionsInDeclaredOrder,
  type StandardFieldColumn,
  type StandardFieldDefinition,
  type StandardFieldOption,
} from "./standardFieldColumns";

export interface StandardFieldColumnSource<TRow> {
  status: "idle" | "loading" | "ready" | "failed";
  /** Set when no organization's fields could be read; the list says so rather than hiding it. */
  error: string | null;
  /** How many of the list's organizations refused or failed (their fields are absent). */
  unavailable: number;
  fields: StandardFieldColumn[];
  /** Column definitions for the canonical table — hidden until picked in Columns. */
  columns: MatrxColumnDef<TRow>[];
  /** Column ids a person may group by (finite answers: choices, yes/no, words). */
  groupableColumnIds: string[];
  /** The group header's words for one raw value of a custom column. */
  labelOf: (columnId: string, value: unknown) => string | undefined;
  /** The RAW cell of a custom column (a choice key, `true`, a word) — what grouping compares. */
  readCell: (row: TRow, columnId: string) => unknown;
  /** Every custom column id, for the list's column state (they start hidden). */
  columnIds: string[];
}

type RowCustomFields = (row: unknown) => Record<string, unknown> | null | undefined;

const defaultRead: RowCustomFields = (row) => {
  const value = (row as { custom_fields?: unknown } | null)?.custom_fields;
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
};

interface Loaded {
  forKey: string;
  fields: StandardFieldColumn[];
  unavailable: number;
  error: string | null;
}

type AcrossAnswer =
  | {
      ok: true;
      data: {
        fields: (Record<string, unknown> & { id: string; options?: Record<string, { label: string; retired?: boolean; position?: number | null }> | null })[];
        unavailable: { organization_id?: string; reason?: string | null }[];
      };
    }
  | { ok: false; error: { code?: string; message: string } };
type AcrossDoor = (args: { token: string; organization_ids: string[] }) => Promise<AcrossAnswer>;
let warnedClientLacksAcross = false;

async function loadFields(
  token: string,
  organizationIds: readonly string[],
  userId: string | null,
): Promise<Omit<Loaded, "forKey">> {
  if (organizationIds.length === 0) return { fields: [], unavailable: 0, error: null };
  const dataSource = recordsDataSource(createClient());
  // ONE READ ACROSS EVERY ORGANIZATION THE LIST SPANS: `custom.entity_fields_across` answers the
  // Fields and their choices together and names any organization it may not reach.
  const client = createRecordsClient({ dataSource, actor: personActor(userId), organizationId: organizationIds[0] });
  // 🚨 THE INSTALLED CLIENT MAY PREDATE THE DOOR (@ai-matrx/records 0.61.1 has no `entityFieldsAcross`;
  // it arrives in 0.63). Calling a missing method threw, and every list's custom columns failed. Until
  // the package lands, read once per organization — said once in the console, never silently.
  const acrossDoor = (client as unknown as { entityFieldsAcross?: AcrossDoor }).entityFieldsAcross;
  if (typeof acrossDoor !== "function") {
    if (!warnedClientLacksAcross) {
      warnedClientLacksAcross = true;
      console.warn(
        "[standard-field-columns] the installed @ai-matrx/records client has no entityFieldsAcross; reading Fields once per organization until it is updated.",
      );
    }
    return loadFieldsPerOrganization(token, organizationIds, userId, dataSource);
  }
  // THE DOOR READS AT MOST ACROSS_PAGE ORGANIZATIONS PER CALL (it refuses more, by name): a person
  // in more is read in pages and the answers merged — never an error that empties every column.
  const pages: string[][] = [];
  for (let i = 0; i < organizationIds.length; i += ACROSS_PAGE) pages.push(organizationIds.slice(i, i + ACROSS_PAGE));
  const answers = await Promise.all(
    pages.map((ids) => acrossDoor.call(client, { token, organization_ids: ids })),
  );
  const refused = answers.find((a): a is Extract<AcrossAnswer, { ok: false }> => !a.ok);
  if (!refused) {
    const definitions: StandardFieldDefinition[] = [];
    const optionsByField = new Map<string, StandardFieldOption[]>();
    let unavailableReasons: string[] = [];
    for (const across of answers) {
      if (!across.ok) continue;
      for (const field of across.data.fields) {
        definitions.push(field as unknown as StandardFieldDefinition);
        if (field.options && typeof field.options === "object") {
          optionsByField.set(
            field.id,
            optionsInDeclaredOrder(field.options),
          );
        }
      }
      unavailableReasons = unavailableReasons.concat(across.data.unavailable.map((u) => u.reason ?? "unavailable"));
    }
    const unavailable = unavailableReasons.length;
    return {
      fields: mergeFieldDefinitions(definitions, optionsByField),
      unavailable,
      error: unavailable === organizationIds.length ? (unavailableReasons[0] ?? null) : null,
    };
  }
  if (refused.error.code !== "door_absent") {
    return { fields: [], unavailable: organizationIds.length, error: refused.error.message };
  }
  // THE DOOR IS NOT ON THIS DATABASE YET (it is owed by lane7w2_b, the chair's apply): read once
  // per organization until it lands — said once in the console, never silently.
  if (!warnedPerOrganization) {
    warnedPerOrganization = true;
    console.warn(
      "[standard-field-columns] custom.entity_fields_across is not on this database yet; reading Fields once per organization.",
    );
  }
  return loadFieldsPerOrganization(token, organizationIds, userId, dataSource);
}

let warnedPerOrganization = false;

/** The most organizations one `custom.entity_fields_across` call reads (the door's own cap). */
export const ACROSS_PAGE = 200;

async function loadFieldsPerOrganization(
  token: string,
  organizationIds: readonly string[],
  userId: string | null,
  dataSource: ReturnType<typeof recordsDataSource>,
): Promise<Omit<Loaded, "forKey">> {
  const definitions: StandardFieldDefinition[] = [];
  const optionsByField = new Map<string, StandardFieldOption[]>();
  let unavailable = 0;
  let lastError: string | null = null;
  await Promise.all(
    organizationIds.map(async (organizationId) => {
      const client = createRecordsClient({ dataSource, actor: personActor(userId), organizationId });
      const answer = await client.entityFields({ token });
      if (!answer.ok) {
        unavailable += 1;
        lastError = answer.error.message;
        return;
      }
      for (const field of answer.data as unknown as StandardFieldDefinition[]) {
        definitions.push(field);
        // The Field's own options column; config for a Field written before that column.
        const config = (field.config ?? {}) as Record<string, unknown>;
        const optionsTableId = field.options_table_id ?? config.options_table_id;
        if (field.type === "list" && typeof optionsTableId === "string" && optionsTableId) {
          const options = await client.fieldOptions({ field_id: field.id });
          // A choice list that cannot be read still lists its values as stored.
          if (options.ok) {
            optionsByField.set(
              field.id,
              options.data
                .filter((o) => !o.deleted_at)
                .map((o) => ({ key: optionKey(o), label: optionLabel(o) })),
            );
          }
        }
      }
    }),
  );
  const fields = mergeFieldDefinitions(definitions, optionsByField);
  const allFailed = organizationIds.length > 0 && unavailable === organizationIds.length;
  return { fields, unavailable, error: allFailed ? lastError : null };
}

export function useStandardFieldColumns<TRow>(
  token: string,
  organizationIds: readonly string[] | null | undefined,
  options: { readCustomFields?: (row: TRow) => Record<string, unknown> | null | undefined } = {},
): StandardFieldColumnSource<TRow> {
  const userId = useAppSelector(selectUserId);
  const orgKey = organizationIds ? [...organizationIds].sort().join(",") : null;
  const requestKey = orgKey === null ? null : `${token}|${orgKey}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (requestKey === null || orgKey === null) return;
    let cancelled = false;
    const orgs = orgKey ? orgKey.split(",") : [];
    loadFields(token, orgs, userId ?? null)
      .then((result) => {
        if (!cancelled) setLoaded({ forKey: requestKey, ...result });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoaded({
            forKey: requestKey,
            fields: [],
            unavailable: orgs.length,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, orgKey, requestKey, userId]);

  const current = loaded && loaded.forKey === requestKey ? loaded : null;
  const fields = useMemo(() => current?.fields ?? [], [current]);
  const readCustomFields = (options.readCustomFields ?? defaultRead) as RowCustomFields;

  const columns = useMemo<MatrxColumnDef<TRow>[]>(
    () =>
      fields.map((field) => {
        const read = (row: TRow) => readCustomFields(row)?.[field.key];
        const shown = (row: TRow) => displayCustomValue(field, read(row));
        const base: MatrxColumnDef<TRow> = {
          id: columnIdFor(field.key),
          header: field.label,
          label: field.label,
          accessorFn: read,
          copyValue: shown,
          filterValue: shown,
          cell: (row) => shown(row),
          sortable: true,
          hidden: true,
          hideable: true,
          minWidth: 120,
        };
        if (field.behavior === "boolean") {
          return { ...base, filter: "boolean" };
        }
        if (field.behavior === "list" && field.options.length > 0) {
          return {
            ...base,
            filter: "select",
            filterOptions: field.options.map((o) => ({ value: o.key, label: o.label })),
          };
        }
        if (field.behavior === "range" && !field.isDate) {
          return { ...base, filter: "number", align: "right" };
        }
        return { ...base, filter: "text" };
      }),
    // readCustomFields is config, fixed per list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fields],
  );

  const groupableColumnIds = useMemo(
    () => fields.filter((f) => !f.multi && f.behavior !== "range").map((f) => columnIdFor(f.key)),
    [fields],
  );

  const labelOf = useMemo(
    () => (columnId: string, value: unknown) => {
      const key = keyOfColumnId(columnId);
      const field = key ? fields.find((f) => f.key === key) : undefined;
      if (!field) return undefined;
      return displayCustomValue(field, value) || undefined;
    },
    [fields],
  );

  const readCell = (row: TRow, columnId: string) => {
    const key = keyOfColumnId(columnId);
    return key ? readCustomFields(row)?.[key] : undefined;
  };
  const columnIds = fields.map((f) => columnIdFor(f.key));

  return {
    readCell,
    columnIds,
    status: requestKey === null ? "idle" : !current ? "loading" : current.error ? "failed" : "ready",
    error: current?.error ?? null,
    unavailable: current?.unavailable ?? 0,
    fields,
    columns,
    groupableColumnIds,
    labelOf,
  };
}
