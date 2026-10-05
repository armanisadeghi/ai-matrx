"use client";

/**
 * The run form's input for a Table / Tables variable: THE ONE TABLE PICKER
 * (`TableChooser`, every table the person can see across all her organizations,
 * the shell's lanes and organization filter at All). The value is a reference —
 * a table id, or a list of them — never text (`utils/table-variable.ts`).
 */

import { X } from "lucide-react";
import { TableChooser } from "@ai-matrx/chat/host/ui-slots";
import { useTablesEverywhere } from "@ai-matrx/chat/host/ui-slots";
import {
  readTableReference,
  tableReferenceValue,
  type TableVariableType,
} from "../../../utils/table-variable";

interface TableVariableInputProps {
  type: TableVariableType;
  value: unknown;
  onChange: (value: string | string[]) => void;
  variableName: string;
  readonly?: boolean;
}

export function TableVariableInput({
  type,
  value,
  onChange,
  variableName,
  readonly,
}: TableVariableInputProps) {
  const tables = useTablesEverywhere();
  const ids = readTableReference(value);

  if (type === "table") {
    return (
      <div data-table-variable={variableName}>
        <TableChooser
          tables={tables}
          value={ids[0] ?? null}
          onSelect={(id) => onChange(tableReferenceValue("table", [id]))}
          readonly={readonly}
          label={null}
        />
      </div>
    );
  }

  const nameOf = (id: string) =>
    tables.rows.find((t) => t.table_id === id)?.table_name ??
    (tables.loading ? "…" : "Table unavailable");

  return (
    <div className="space-y-1.5" data-table-variable={variableName}>
      {ids.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen tables">
          {ids.map((id) => (
            <li
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/50 py-0.5 pl-2.5 pr-1 text-xs text-foreground"
            >
              <span className="truncate">{nameOf(id)}</span>
              {!readonly && (
                <button
                  type="button"
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={`Remove ${nameOf(id)}`}
                  onClick={() =>
                    onChange(tableReferenceValue("tables", ids.filter((x) => x !== id)))
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <TableChooser
        tables={tables}
        value={null}
        exclude={ids}
        onSelect={(id) => onChange(tableReferenceValue("tables", [...ids, id]))}
        readonly={readonly}
        label={null}
        placeholder={ids.length > 0 ? "Add another table…" : "Choose tables…"}
      />
    </div>
  );
}

/** The chosen tables' names, for a one-line summary of a Table variable's value. */
export function TableReferenceNames({ value }: { value: unknown }) {
  const tables = useTablesEverywhere();
  const ids = readTableReference(value);
  if (ids.length === 0) return null;
  const names = ids.map(
    (id) =>
      tables.rows.find((t) => t.table_id === id)?.table_name ??
      (tables.loading ? "…" : "Table unavailable"),
  );
  return <>{names.join(", ")}</>;
}
