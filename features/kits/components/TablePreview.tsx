"use client";

// TablePreview — one kit table before it exists: its columns, and its example rows
// as a small read-only grid. An example row that points at a platform record (an AI
// model) shows that record's live name.

import { Table2 } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { KitTable } from "../types";
import { KitIcon } from "./KitIcon";

const MAX_ROWS = 8;

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
    return <span className="text-muted-foreground/50">—</span>;
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
  if (isRecord(value)) return <span className="font-mono text-[10.5px] text-muted-foreground">{JSON.stringify(value)}</span>;
  return <span className="line-clamp-2">{String(value)}</span>;
}

export function TablePreview({
  table,
  kitKey,
  refNames,
}: {
  table: KitTable;
  kitKey: string;
  refNames: Record<string, string>;
}) {
  const rows = table.records.slice(0, MAX_ROWS);
  const more = table.records.length - rows.length;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-3 border-b border-border p-3">
        <KitIcon name={table.icon ?? "table"} tintKey={`${kitKey}:${table.key}`} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-foreground">{table.name}</h4>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {table.records.length} {table.records.length === 1 ? "row" : "rows"}
            </span>
          </div>
          {table.description && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{table.description}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/20 px-3 py-2">
        {table.fields.map((f) => (
          <span
            key={f.key}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px]"
            title={f.description}
          >
            <span className="font-medium text-foreground">{f.label}</span>
            <span className="text-muted-foreground">{TYPE_WORDS[f.type] ?? f.type}</span>
            {f.required && <span className="text-destructive">*</span>}
          </span>
        ))}
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border">
                {table.fields.map((f) => (
                  <th key={f.key} className="whitespace-nowrap px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {f.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                  {table.fields.map((f) => (
                    <td key={f.key} className="max-w-[260px] px-3 py-1.5 align-top text-foreground/90">
                      <Cell value={r[f.key]} refNames={refNames} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {more > 0 && (
            <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              and {more} more {more === 1 ? "row" : "rows"}
            </p>
          )}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 px-3 py-3 text-xs text-muted-foreground">
          <Table2 className="h-3.5 w-3.5" />
          Starts empty — you fill it in.
        </p>
      )}
    </div>
  );
}
