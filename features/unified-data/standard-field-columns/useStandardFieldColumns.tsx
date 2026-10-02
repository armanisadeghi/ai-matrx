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
// Definitions come through the store's own door (`custom.entity_fields`, one call per
// organization, as the person) — never a direct read of the field registry — and only fields the
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

async function loadFields(
  token: string,
  organizationIds: readonly string[],
  userId: string | null,
): Promise<Omit<Loaded, "forKey">> {
  const dataSource = recordsDataSource(createClient());
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
        const config = (field.config ?? {}) as Record<string, unknown>;
        if (field.type === "list" && typeof config.options_table_id === "string") {
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

  return {
    status: requestKey === null ? "idle" : !current ? "loading" : current.error ? "failed" : "ready",
    error: current?.error ?? null,
    unavailable: current?.unavailable ?? 0,
    fields,
    columns,
    groupableColumnIds,
    labelOf,
  };
}
