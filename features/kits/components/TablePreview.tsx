"use client";

// TablePreview — one kit table before it exists: its columns, and its example rows
// as a small read-only grid. An example row that points at a platform record (an AI
// model) shows that record's live name.

import { Table2 } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { KitTable } from "../types";
import { count } from "../format";
import { Skeleton } from "@ai-matrx/design-system";


const TYPE_WORDS: Record<string, string> = {
  text: "Text",
  long_text: "Long text",
  number: "Number",
  select: "Choice",
  single_select: "Choice",
  multi_select: "Choices",
  entity_reference: "Link",
  url: "Link (web)",
  date: "Date",
  checkbox: "Yes / no",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function Cell({ value, refNames }: { value: unknown; refNames: Record<string, string> }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (isRecord(value) && typeof value.token === "string" && typeof value.id === "string") {
    // A platform record is a door (THE DOOR LAW): EntityRef routes, peeks and opens it.
    return (
      <EntityRef
        token={value.token}
        id={value.id}
        name={refNames[`${value.token}:${value.id}`] ?? null}
        className="max-w-full text-[11px]"
      />
    );
  }
  if (Array.isArray(value)) return <span className="line-clamp-2">{value.map(String).join(", ")}</span>;
  if (isRecord(value)) return <span className="font-mono text-[10.5px] text-foreground">{JSON.stringify(value)}</span>;
  return <span className="line-clamp-2">{String(value)}</span>;
}

export function TablePreview({
  table,
  refNames,
  previewRows,
}: {
  table: KitTable;
  refNames: Record<string, string>;
  /** The `kits.preview_rows` knob; null while it loads. */
  previewRows: number | null;
}) {
  const rows = previewRows === null ? [] : table.records.slice(0, previewRows);
  const more = table.records.length - rows.length;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Table2 className="h-4 w-4 shrink-0 text-chart-2" />
          <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">{table.name}</h3>
          <span className="shrink-0 text-xs text-muted-foreground">{count(table.records.length, "row")}</span>
        </div>
        {table.description && <p className="mt-1 text-sm text-foreground">{table.description}</p>}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {table.fields.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-4 py-2 text-xs font-medium text-foreground" title={f.description}>
                    {f.label}
                    {f.required && <span className="ml-0.5 text-destructive">*</span>}
                    <span className="ml-1.5 font-normal text-muted-foreground">{TYPE_WORDS[f.type] ?? f.type}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  {table.fields.map((f) => (
                    <td key={f.key} className="max-w-[260px] px-4 py-2 align-top text-foreground">
                      <Cell value={r[f.key]} refNames={refNames} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {more > 0 && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
              +{count(more, "more row")}
            </p>
          )}
        </div>
      ) : table.records.length > 0 ? (
        // The `kits.preview_rows` knob is still loading.
        <div className="space-y-2 px-4 py-3" aria-busy="true">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : (
        <p className="flex items-center gap-1.5 px-4 py-3 text-sm text-muted-foreground">
          <Table2 className="h-3.5 w-3.5" />
          Starts empty
        </p>
      )}
    </div>
  );
}
