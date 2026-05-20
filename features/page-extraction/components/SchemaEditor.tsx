/**
 * features/page-extraction/components/SchemaEditor.tsx
 *
 * Edits the template's output column schema — the durable table
 * definition. Each column declares its `source`, which decides who fills
 * it (agent / validation / manual / system).
 *
 * "Import columns from agent" seeds the list from the selected agent's
 * structured output_schema. From there the user adds/removes/reorders
 * columns and retags sources — so the table can have MORE columns than
 * the agent returns (manual review fields, validation flags) or FEWER
 * (drop agent fields you don't want).
 *
 * When the column list is empty, the template has no schema and the
 * Results table inherits the agent's schema / infers from data at run
 * time — no double entry.
 */

"use client";

import { ArrowDown, ArrowUp, Download, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildTemplateSchema,
  humanizeKey,
  importColumnsFromAgentSchema,
  parseTemplateColumns,
} from "@/features/page-extraction/utils/columns";
import type {
  ColumnSource,
  ColumnType,
  ExtractionColumn,
} from "@/features/page-extraction/types";

const SOURCES: ColumnSource[] = ["agent", "validation", "manual", "system"];
const TYPES: ColumnType[] = ["string", "number", "integer", "boolean"];

export interface SchemaEditorProps {
  /** The draft's current outputSchema (any shape). */
  outputSchema: unknown;
  /** The selected agent's output_schema, for "Import from agent". */
  agentOutputSchema: unknown;
  /** Persist a new outputSchema onto the draft. Pass null to clear
   *  (template falls back to inheriting the agent schema). */
  onChange: (next: unknown) => void;
}

export function SchemaEditor({
  outputSchema,
  agentOutputSchema,
  onChange,
}: SchemaEditorProps) {
  const columns = parseTemplateColumns(outputSchema) ?? [];

  const commit = (next: ExtractionColumn[]) => {
    if (next.length === 0) {
      onChange(null); // empty → inherit agent schema at run time
      return;
    }
    onChange(buildTemplateSchema(next));
  };

  const importFromAgent = () => {
    const imported = importColumnsFromAgentSchema(agentOutputSchema);
    if (imported.length === 0) return;
    // Merge: keep any manual/validation columns the user already added,
    // refresh/insert the agent columns from the agent schema.
    const nonAgent = columns.filter((c) => c.source !== "agent");
    commit([...imported, ...nonAgent]);
  };

  const addColumn = (source: ColumnSource) => {
    const base =
      source === "manual"
        ? "reviewed"
        : source === "validation"
          ? "is_duplicate"
          : "new_field";
    let key = base;
    let n = 1;
    const taken = new Set(columns.map((c) => c.key));
    while (taken.has(key)) key = `${base}_${++n}`;
    commit([
      ...columns,
      {
        key,
        label: humanizeKey(key),
        type: source === "validation" ? "boolean" : "string",
        source,
        ...(source === "agent" ? { agentField: key } : {}),
      },
    ]);
  };

  const update = (idx: number, patch: Partial<ExtractionColumn>) => {
    commit(columns.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const remove = (idx: number) => {
    commit(columns.filter((_, i) => i !== idx));
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= columns.length) return;
    const next = columns.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    commit(next);
  };

  const agentImportable =
    importColumnsFromAgentSchema(agentOutputSchema).length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          Output columns
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-1.5 text-[10px]"
          onClick={importFromAgent}
          disabled={!agentImportable}
          title={
            agentImportable
              ? "Seed columns from the agent's output schema"
              : "The selected agent has no structured output schema to import"
          }
        >
          <Download className="w-3 h-3 mr-1" />
          Import from agent
        </Button>
      </div>

      {columns.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/70 leading-snug">
          No columns defined — the Results table will inherit the agent&apos;s
          schema (or infer columns from the data). Import from the agent or
          add columns to take control of the table shape, add review fields,
          or drop fields you don&apos;t want.
        </p>
      ) : (
        <ul className="space-y-1">
          {columns.map((col, idx) => (
            <li
              key={idx}
              className="rounded-md border border-border bg-card p-1.5 space-y-1"
            >
              <div className="flex items-center gap-1">
                <Input
                  value={col.label}
                  onChange={(e) => update(idx, { label: e.target.value })}
                  placeholder="Label"
                  className="h-6 text-[11px] flex-1"
                />
                <select
                  value={col.source}
                  onChange={(e) =>
                    update(idx, { source: e.target.value as ColumnSource })
                  }
                  className="h-6 text-[10px] rounded-md border border-input bg-background px-1"
                  title="Where this column's value comes from"
                >
                  {SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="h-6 w-5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  title="Move up"
                >
                  <ArrowUp className="w-3 h-3 mx-auto" />
                </button>
                <button
                  type="button"
                  className="h-6 w-5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  onClick={() => move(idx, 1)}
                  disabled={idx === columns.length - 1}
                  title="Move down"
                >
                  <ArrowDown className="w-3 h-3 mx-auto" />
                </button>
                <button
                  type="button"
                  className="h-6 w-5 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(idx)}
                  title="Remove column"
                >
                  <X className="w-3 h-3 mx-auto" />
                </button>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  value={col.key}
                  onChange={(e) =>
                    update(idx, {
                      key: e.target.value.replace(/\s+/g, "_").toLowerCase(),
                    })
                  }
                  placeholder="key"
                  className="h-6 text-[10px] font-mono flex-1"
                  title="Stable column key (also the payload key)"
                />
                <select
                  value={col.type}
                  onChange={(e) =>
                    update(idx, { type: e.target.value as ColumnType })
                  }
                  className="h-6 text-[10px] rounded-md border border-input bg-background px-1"
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {col.source === "agent" && (
                  <Input
                    value={col.agentField ?? ""}
                    onChange={(e) =>
                      update(idx, { agentField: e.target.value })
                    }
                    placeholder="agent field"
                    className="h-6 text-[10px] font-mono flex-1"
                    title="Which agent-output field maps into this column"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px]"
          onClick={() => addColumn("agent")}
        >
          <Plus className="w-3 h-3 mr-0.5" /> Agent
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px]"
          onClick={() => addColumn("manual")}
        >
          <Plus className="w-3 h-3 mr-0.5" /> Manual
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px]"
          onClick={() => addColumn("validation")}
        >
          <Plus className="w-3 h-3 mr-0.5" /> Validation
        </Button>
      </div>
    </div>
  );
}
