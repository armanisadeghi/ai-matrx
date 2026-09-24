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
  listUserTables,
  type UserTableListItem,
} from "@/features/data-tables/service";
import { isServiceFailure } from "@/features/data-tables/types";

import type { EventConfig } from "../../../types";

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

  useEffect(() => {
    let cancelled = false;
    void listUserTables().then((result) => {
      if (cancelled) return;
      if (isServiceFailure(result)) setTablesError(result.error);
      else setTables(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const config: EventConfig = {
    entity_type: value.entity_type ?? "user_table_row",
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
    void getTableMetadata({ tableId: chosenTableId }).then((result) => {
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
    });
    return () => {
      cancelled = true;
    };
  }, [chosenTableId]);
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
  // A schedule on ONE record-store table: that table is the subject (the grid opened this form
  // for it), and its change words are the store's own.
  const onRecordStoreTable = config.entity_type.startsWith("custom_record:");
  const actionChoices = onRecordStoreTable ? RECORD_EVENT_ACTIONS : ROW_EVENT_ACTIONS;
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

      {onRecordStoreTable ? (
        <div className="space-y-2">
          <Label>Table</Label>
          <p className="text-sm text-muted-foreground">The table you opened this from.</p>
        </div>
      ) : (
      <div className="space-y-2">
        <Label htmlFor="ev-table">Table</Label>
        <Select
          value={config.table_id ?? ANY_TABLE}
          onValueChange={(v) => update({ table_id: v === ANY_TABLE ? undefined : v })}
        >
          <SelectTrigger id="ev-table" className="max-w-md">
            <SelectValue placeholder="Any of my tables" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_TABLE}>Any of my tables</SelectItem>
            {(tables ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.table_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tablesError && <p className="text-xs text-destructive">Could not load your tables: {tablesError}</p>}
        {tables && tables.length === 0 && (
          <p className="text-xs text-muted-foreground">You have no data tables yet; the schedule will fire for any table you create.</p>
        )}
      </div>
      )}

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
          <p className="text-xs text-destructive">Could not load this table&apos;s columns: {columnsError}</p>
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

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
