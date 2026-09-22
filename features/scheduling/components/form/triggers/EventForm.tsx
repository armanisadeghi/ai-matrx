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
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listUserTables, type UserTableListItem } from "@/features/data-tables/service";
import { isServiceFailure } from "@/features/data-tables/types";

import type { EventConfig } from "../../../types";

export const ROW_EVENT_ACTIONS: readonly { value: string; label: string }[] = [
  { value: "row.created", label: "A row is added" },
  { value: "row.updated", label: "A row is changed" },
  { value: "row.archived", label: "A row is archived" },
  { value: "row.restored", label: "A row is restored" },
  { value: "row.deleted", label: "A row is deleted" },
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

      <div className="space-y-2">
        <Label>When</Label>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ROW_EVENT_ACTIONS.map((a) => (
            <label key={a.value} className="flex items-center gap-2 text-sm">
              <Checkbox checked={actions.includes(a.value)} onCheckedChange={() => toggleAction(a.value)} />
              {a.label}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Nothing ticked means every kind of change.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="ev-fields">Only when these columns change (optional)</Label>
        <Input
          id="ev-fields"
          value={(config.changed_fields ?? []).join(", ")}
          onChange={(e) =>
            update({
              changed_fields: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="status, reset_date"
          className="max-w-md"
        />
        <p className="text-xs text-muted-foreground">
          Machine column names, comma-separated. Applies to changed rows only.
        </p>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
