// features/scheduling/components/form/VariablesEditor.tsx
//
// Lightweight key/value editor for `sch_agent_task.variables`. Values are
// stored as JSON; the editor exposes string editing only — anyone who needs
// non-string values can paste JSON into the value field.

"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Row {
  key: string;
  value: string;
}

interface Props {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}

function objToRows(obj: Record<string, unknown>): Row[] {
  return Object.entries(obj).map(([key, val]) => ({
    key,
    value: typeof val === "string" ? val : JSON.stringify(val),
  }));
}

function rowsToObj(rows: Row[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const trimmed = row.key.trim();
    if (!trimmed) continue;
    // Try to parse as JSON; fall back to string.
    let v: unknown = row.value;
    if (row.value.trim().startsWith("{") || row.value.trim().startsWith("[") ||
        row.value === "true" || row.value === "false" || row.value === "null" ||
        /^-?\d+(?:\.\d+)?$/.test(row.value.trim())) {
      try {
        v = JSON.parse(row.value);
      } catch {
        v = row.value;
      }
    }
    out[trimmed] = v;
  }
  return out;
}

export function VariablesEditor({ value, onChange }: Props) {
  const [rows, setRows] = useState<Row[]>(() => objToRows(value));

  const push = (next: Row[]) => {
    setRows(next);
    onChange(rowsToObj(next));
  };

  const updateRow = (idx: number, patch: Partial<Row>) => {
    push(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No variables. Add key/value pairs to template into the prompt.
        </p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={row.key}
            onChange={(e) => updateRow(i, { key: e.target.value })}
            placeholder="key"
            className="w-40 font-mono text-xs"
            maxLength={100}
          />
          <Input
            value={row.value}
            onChange={(e) => updateRow(i, { value: e.target.value })}
            placeholder='value (string or JSON: 42, true, "foo", {"a":1})'
            className="flex-1 font-mono text-xs"
            maxLength={2000}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => push(rows.filter((_, j) => j !== i))}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label="Remove variable"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => push([...rows, { key: "", value: "" }])}
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Add variable
      </Button>
    </div>
  );
}
