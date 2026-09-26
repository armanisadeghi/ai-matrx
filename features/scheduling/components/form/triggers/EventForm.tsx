"use client";

/**
 * EventForm — the `event` trigger: run when something happens on the platform.
 *
 * v1 knows ONE kind of thing: a row in one of the person's data tables
 * (`entity_type: "user_table_row"`, produced by
 * `migrations/udt_row_change_events.sql`). The shape is general — the matcher
 * (`sch_match_event`) reads `entity_type` / `actions` / `table_id` /
 * `changed_fields` — so the next producer (a file, a form answer, a CRM
 * interaction) adds an option here, not a new trigger type.
 */

import { useEffect, useState } from "react";
import { Info } from "lucide-react";

import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTableMetadata,
  listTablesEverywhere,
  rowChangeScheduleFor,
  type UserTableListItem,
} from "@/features/data-tables/service";
import { locateTable } from "@/features/data-tables/data-source/locate-table";
import { isServiceFailure } from "@/features/data-tables/types";

import type { EventConfig } from "../../../types";
import { isRecordSourceKey, toRecordSourceKey } from "../../../utils/recordSourceKey";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export const ROW_EVENT_ACTIONS: readonly { value: string; label: string }[] = [
  { value: "row.created", label: "A row is added" },
  { value: "row.updated", label: "A row is changed" },
  { value: "row.archived", label: "A row is archived" },
  { value: "row.restored", label: "A row is restored" },
  { value: "row.deleted", label: "A row is deleted" },
];

/** A record-store table's changes (GRIDPRIM G4/G8 — the store's own words, `record.*`). */
export const RECORD_EVENT_ACTIONS: readonly { value: string; label: string }[] = [
  { value: "record.created", label: "A row is added" },
  { value: "record.updated", label: "A row is changed" },
  { value: "record.archived", label: "A row is archived" },
  { value: "record.restored", label: "A row is restored" },
];

const ANY_TABLE = "__any__";

interface Props {
  value: Partial<EventConfig>;
  onChange: (v: EventConfig) => void;
  error?: string;
}

export function EventForm({ value, onChange, error }: Props) {
  const [tables, setTables] = useState<UserTableListItem[] | null>(null);
  const [tablesError, setTablesError] = useState<string | null>(null);
  // The chosen table's columns, so "only when these columns change" is a
  // picker, never typed machine names (register ARE-035).
  const [loadedColumns, setLoadedColumns] = useState<{
    tableId: string;
    columns: { field_name: string; display_name: string }[] | null;
    error: string | null;
  } | null>(null);

  // What a change to the CHOSEN table is called, asked of where that table lives (lane
  // INTEG-CLIENTS, CUTOVER-PLAN rev 3 F9): an older table's rows say `user_table_row`; a
  // record-store table's say `record:<id>` (GRIDPRIM G8, lane SOURCE-KEY; an older trigger's
  // `custom_record:<id>` is read and saved as the new key). `cannotFire` = a store table on
  // a database without G8, where a schedule on it would never run — said, never saved silently.
  const [changeWord, setChangeWord] = useState<{
    tableId: string;
    entityType: string | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // BOTH stores (G9's one list): a moved table used to vanish from this picker, and a schedule
    // made on it before the move listened for older row events that never come again.
    void listTablesEverywhere().then((result) => {
      if (cancelled) return;
      if (isServiceFailure(result)) setTablesError(result.error);
      else setTables(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const config: EventConfig = {
    entity_type: toRecordSourceKey(value.entity_type ?? "user_table_row"),
    ...(value.actions && value.actions.length > 0 ? { actions: value.actions } : {}),
    ...(value.table_id ? { table_id: value.table_id } : {}),
    ...(value.changed_fields && value.changed_fields.length > 0
      ? { changed_fields: value.changed_fields }
      : {}),
  };
  const update = (patch: Partial<EventConfig>) => {
    const merged: EventConfig = { ...config, ...patch };
    if (!merged.actions || merged.actions.length === 0) delete merged.actions;
    if (!merged.table_id) delete merged.table_id;
    if (!merged.changed_fields || merged.changed_fields.length === 0) delete merged.changed_fields;
    onChange(merged);
  };
  const actions = config.actions ?? [];
  const chosenTableId = config.table_id;
  useEffect(() => {
    if (!chosenTableId) return;
    let cancelled = false;
    void (async () => {
      // Locate first: it PLACES a record-store table, so the column read below and the change
      // word both go to the store the table lives in.
      const located = await locateTable(chosenTableId);
      if (cancelled) return;
      if (!located.ok) {
        setChangeWord({ tableId: chosenTableId, entityType: null, error: located.error });
      } else {
        const word = await rowChangeScheduleFor({ tableId: chosenTableId });
        if (cancelled) return;
        setChangeWord({
          tableId: chosenTableId,
          entityType: word?.entityType ?? null,
          error: word
            ? null
            : "This table lives in the record store, and this database cannot run a schedule on its changes yet, so this schedule would never run.",
        });
      }
      const result = await getTableMetadata({ tableId: chosenTableId });
      if (cancelled) return;
      setLoadedColumns(
        isServiceFailure(result)
          ? { tableId: chosenTableId, columns: null, error: result.error }
          : {
              tableId: chosenTableId,
              columns: result.data.columns.map((c) => ({ field_name: c.field_name, display_name: c.display_name })),
              error: null,
            },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [chosenTableId]);
  // Keep the saved word in step with where the chosen table lives. Actions of the other store's
  // vocabulary are dropped with it (a `row.updated` never fires on a store table, and back).
  const liveWord = changeWord && changeWord.tableId === chosenTableId ? changeWord : null;
  useEffect(() => {
    if (!liveWord?.entityType || liveWord.entityType === config.entity_type) return;
    const toStore = isRecordSourceKey(liveWord.entityType);
    const allowed = new Set((toStore ? RECORD_EVENT_ACTIONS : ROW_EVENT_ACTIONS).map((a) => a.value));
    update({
      entity_type: liveWord.entityType,
      actions: (config.actions ?? []).filter((a) => allowed.has(a)),
    });
  }, [liveWord?.entityType, liveWord?.tableId]);
  const cannotFire = liveWord?.error ?? null;
  // Only the answer for the table chosen NOW counts; a stale one reads as loading.
  const current = loadedColumns && loadedColumns.tableId === chosenTableId ? loadedColumns : null;
  const columns = current?.columns ?? null;
  const columnsError = current?.error ?? null;
  const watched = config.changed_fields ?? [];
  const toggleColumn = (fieldName: string) =>
    update({
      changed_fields: watched.includes(fieldName)
        ? watched.filter((f) => f !== fieldName)
        : [...watched, fieldName],
    });
  // A schedule on ONE record-store table: its change words are the store's own.
  const onRecordStoreTable = isRecordSourceKey(config.entity_type);
  const actionChoices = onRecordStoreTable ? RECORD_EVENT_ACTIONS : ROW_EVENT_ACTIONS;
  // "Any table" can only mean the older store's tables (a record-store table is named one by
  // one), so the words say so as soon as this person has a record-store table at all.
  const anyTableLabel = (tables ?? []).some((t) => t.store === "records")
    ? "Any of my older tables (pick a table to use a newer one)"
    : "Any of my tables";
  const toggleAction = (action: string) =>
    update({
      actions: actions.includes(action) ? actions.filter((a) => a !== action) : [...actions, action],
    });

  return (
    <div className="space-y-3">
      <div className="flex gap-2 rounded-md border border-info/40 bg-info/10 p-2.5 text-xs">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info" />
        <span>
          Runs the moment a row in one of your data tables changes. The agent receives the
          table, the row and the columns that changed as the <code>event</code> variable. One run
          at a time per schedule: changes that arrive while a run is in progress are not queued
          again.
        </span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ev-table">Table</Label>
        <Select
          value={config.table_id ?? ANY_TABLE}
          onValueChange={(v) =>
            // "Any table" listens for the older store's row events: a record-store table is
            // always named one by one, by its own change word (set once the table is located).
            v === ANY_TABLE ? update({ table_id: undefined, entity_type: "user_table_row" }) : update({ table_id: v })
          }
        >
          <SelectTrigger id="ev-table" className="max-w-md">
            <SelectValue placeholder={anyTableLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_TABLE}>{anyTableLabel}</SelectItem>
            {(tables ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.table_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tablesError && <p className="text-xs text-destructive">Could not load your tables: {tablesError} <ErrorAlchemyMenu error={tablesError} /></p>}
        {cannotFire && <p className="text-xs text-destructive">{cannotFire} <ErrorAlchemyMenu error={cannotFire} /></p>}
        {tables && tables.length === 0 && (
          <p className="text-xs text-muted-foreground">You have no data tables yet; the schedule will fire for any table you create.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>When</Label>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {actionChoices.map((a) => (
            <label key={a.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={actions.includes(a.value)} onCheckedChange={() => toggleAction(a.value)} />
              {a.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Nothing ticked means every kind of change.</p>
      </div>

      <div className="space-y-2">
        <Label>Only when these columns change (optional)</Label>
        {!chosenTableId ? (
          <p className="text-xs text-muted-foreground">
            Pick a table above to choose its columns. With any table, every change counts.
          </p>
        ) : columnsError ? (
          <p className="text-xs text-destructive">Could not load this table&apos;s columns: {columnsError} <ErrorAlchemyMenu error={columnsError} /></p>
        ) : !columns ? (
          <p className="text-xs text-muted-foreground">Loading this table&apos;s columns…</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {columns.map((c) => (
              <label key={c.field_name} className="flex items-center gap-2 text-sm">
                <Checkbox checked={watched.includes(c.field_name)} onCheckedChange={() => toggleColumn(c.field_name)} />
                {c.display_name}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Nothing ticked means a change to any column counts. Applies to changed rows only.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>}
    </div>
  );
}
