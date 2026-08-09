"use client";

/**
 * Schema tab — the kind's stored field list (`kind_definition.data`, the
 * ordered StoredFieldElement[]) plus the materialized `emitted_json_schema`
 * (collapsible, copyable). Python-owned kinds have no `data` — their fields
 * live in the pydantic mirror, so only the emitted schema shows.
 */

import { Copy, Info } from "lucide-react";
import { toast } from "@/lib/toast";
import type { Json } from "@/types/database.types";
import type { StoredFieldElement } from "@/features/content-ir/registry/kind-storage-transform";
import { cn } from "@/lib/utils";
import {
  MOBILE_TABLE_FROZEN,
} from "@/components/official/mobile-table/mobileTable";

interface FieldRow {
  name: string;
  depth: number;
  type: string;
  required: boolean;
  nullable: boolean;
}

function isStoredFieldArray(value: Json | null): value is Json[] {
  return (
    Array.isArray(value) &&
    value.every(
      (el) =>
        typeof el === "object" &&
        el !== null &&
        !Array.isArray(el) &&
        typeof (el as { name?: unknown }).name === "string" &&
        typeof (el as { type?: unknown }).type === "string",
    )
  );
}

function typeSummary(el: StoredFieldElement): string {
  switch (el.type) {
    case "enum":
      return `enum(${el.values.join(" | ")})`;
    case "union":
      return `union(${el.scalars.join(" | ")})`;
    case "record":
      return `record<string, ${el.values}>`;
    case "inline_object":
      return `inline_object (${el.fields.length} fields)`;
    case "object":
      return "object → (ref via kind_edge)";
    case "array":
      return "array → (refs via kind_edge)";
    default:
      return el.type;
  }
}

function flattenStoredFields(
  elements: StoredFieldElement[],
  prefix = "",
  depth = 0,
): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const el of elements) {
    rows.push({
      name: `${prefix}${el.name}`,
      depth,
      type: typeSummary(el),
      required: el.required ?? false,
      nullable: el.nullable ?? false,
    });
    if (el.type === "inline_object") {
      rows.push(...flattenStoredFields(el.fields, `${prefix}${el.name}.`, depth + 1));
    }
  }
  return rows;
}

interface KindSchemaTabProps {
  kind: string;
  fieldData: Json | null;
  emittedJsonSchema: Json | null;
}

export default function KindSchemaTab({
  kind,
  fieldData,
  emittedJsonSchema,
}: KindSchemaTabProps) {
  const fieldRows = isStoredFieldArray(fieldData)
    ? flattenStoredFields(fieldData as unknown as StoredFieldElement[])
    : null;
  const schemaText =
    emittedJsonSchema === null ? null : JSON.stringify(emittedJsonSchema, null, 2);

  async function copySchema() {
    if (!schemaText) return;
    try {
      await navigator.clipboard.writeText(schemaText);
      toast.success(`Copied ${kind} emitted_json_schema`);
    } catch (error) {
      toast.error(
        `Clipboard copy failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      {/* Fields */}
      <section className="overflow-hidden rounded-md border border-border bg-card">
        <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
          Fields (kind_definition.data)
        </div>
        {fieldRows === null ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            No stored field list — python-owned kinds derive their schema from
            the pydantic mirror; see emitted_json_schema below.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className={cn("text-sm", MOBILE_TABLE_FROZEN)}>
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium">Field</th>
                  <th className="px-3 py-1.5 font-medium">Type</th>
                  <th className="px-3 py-1.5 font-medium">Required</th>
                  <th className="px-3 py-1.5 font-medium">Nullable</th>
                </tr>
              </thead>
              <tbody>
                {fieldRows.map((row) => (
                  <tr
                    key={row.name}
                    className="border-b border-border/60 last:border-0 hover:bg-accent/30"
                  >
                    <td
                      className="px-3 py-1.5 font-mono text-xs text-foreground"
                      style={{ paddingLeft: `${12 + row.depth * 16}px` }}
                    >
                      {row.name}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {row.type}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {row.required ? (
                        <span className="font-medium text-foreground">yes</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {row.nullable ? (
                        <span className="font-medium text-foreground">yes</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {fieldRows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-3 py-3 text-center text-xs text-muted-foreground"
                    >
                      Empty field list.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* emitted_json_schema */}
      <section className="rounded-md border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-sm font-semibold text-foreground">
            emitted_json_schema
          </span>
          <button
            type="button"
            onClick={copySchema}
            disabled={!schemaText}
            className="ml-auto flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-40"
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>
        </div>
        {schemaText ? (
          <details open>
            <summary className="cursor-pointer px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
              {schemaText.length.toLocaleString()} chars — click to collapse
            </summary>
            <pre className="overflow-x-auto border-t border-border p-3 font-mono text-xs text-foreground">
              {schemaText}
            </pre>
          </details>
        ) : (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            No emitted_json_schema materialized for this kind — the structural
            gate cannot run until it exists.
          </p>
        )}
      </section>
    </div>
  );
}
