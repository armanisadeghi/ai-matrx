"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { DEFAULT_DATABASE_SCHEMA } from "@/app/(admin)/administration/database/config";
import { useRegisteredTables } from "../hooks/useRegisteredTables";
import { OverrideCombobox } from "./OverrideCombobox";

export interface SchemaTableValues {
  schema: string;
  table: string;
}

export function SchemaTableFields({
  values,
  onChange,
  disabled = false,
}: {
  values: SchemaTableValues;
  onChange: (patch: Partial<SchemaTableValues>) => void;
  disabled?: boolean;
}) {
  const { schemas, tablesForSchema, quickPickOptions, loading } =
    useRegisteredTables();
  const [quickPick, setQuickPick] = useState("");

  const tableOptions = useMemo(
    () => tablesForSchema(values.schema),
    [tablesForSchema, values.schema],
  );

  const quickPickLabels = useMemo(
    () =>
      [...new Set(quickPickOptions.map((o) => o.split(" · ")[0] ?? o))].sort(),
    [quickPickOptions],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {quickPickLabels.length > 0 ? (
        <div className="flex min-w-[200px] flex-1 items-center gap-1.5 sm:max-w-xs sm:flex-none">
          <span className="shrink-0 text-[11px] text-muted-foreground">
            Registered
          </span>
          <OverrideCombobox
            value={quickPick}
            onChange={setQuickPick}
            onSelect={(label) => {
              const dot = label.indexOf(".");
              if (dot <= 0) return;
              onChange({
                schema: label.slice(0, dot),
                table: label.slice(dot + 1),
              });
              setQuickPick("");
            }}
            options={quickPickLabels}
            placeholder="Pick schema.table…"
            className="min-w-0 flex-1"
            disabled={disabled || loading}
            maxVisible={50}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Schema</span>
        <OverrideCombobox
          value={values.schema}
          onChange={(schema) => onChange({ schema })}
          options={schemas}
          placeholder={DEFAULT_DATABASE_SCHEMA}
          className="w-32"
          disabled={disabled || loading}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Table</span>
        <OverrideCombobox
          value={values.table}
          onChange={(table) => onChange({ table })}
          options={tableOptions}
          placeholder="notes"
          className="w-40"
          disabled={disabled || loading}
        />
      </div>

      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      ) : null}
    </div>
  );
}
