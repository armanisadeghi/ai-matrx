/**
 * RowActionPreview — the row an action is about to change, shown AS A ROW:
 * every column in column order, what it holds now and what it will hold, the
 * changed cells tinted and struck through (Arman, 2026-09-21: "show the row as
 * though it's getting live changes", never a list of field patches).
 *
 * The data is the grid's own row; the before/after is `previewRowAction`
 * (row-actions.ts), which also recomputes formula columns that read a changed
 * cell, so the person sees what the grid will show a second after the click.
 */
"use client";

import { formatFieldValue, resolveFieldFormat } from "@ai-matrx/design-system/field-formats";
import { cn } from "@/lib/utils";

import type { RowActionPreview as Preview, RowActionPreviewCell } from "../row-actions";

type FieldLike = { field_name: string; data_type: string; metadata?: unknown };

function showFor(fields: readonly FieldLike[]) {
  return (cell: RowActionPreviewCell, value: unknown): string => {
    const f = fields.find((x) => x.field_name === cell.fieldName);
    if (value === null || value === undefined || value === "") return "";
    if (!f) return typeof value === "object" ? JSON.stringify(value) : String(value);
    const shown = formatFieldValue(value, resolveFieldFormat(f.data_type, f.metadata), f.data_type);
    return shown.empty ? "" : shown.text;
  };
}

export function RowActionPreview({ preview, fields }: { preview: Extract<Preview, { ok: true }>; fields: readonly FieldLike[] }) {
  const show = showFor(fields);
  return (
    <div className="space-y-1" data-testid="row-action-preview">
      <div className="max-w-full overflow-x-auto rounded border">
        <table className="w-max min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-10 bg-muted/60 px-2 py-1 text-left font-medium text-muted-foreground" />
              {preview.cells.map((c) => (
                <th
                  key={c.fieldName}
                  className={cn(
                    "max-w-[180px] truncate border-l px-2 py-1 text-left font-medium",
                    c.changed ? "text-foreground" : "text-muted-foreground",
                  )}
                  title={c.displayName}
                >
                  {c.displayName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(["before", "after"] as const).map((which) => (
              <tr key={which} className="border-t" data-preview-row={which}>
                <th scope="row" className="sticky left-0 z-10 bg-background px-2 py-1 text-left font-medium text-muted-foreground">
                  {which === "before" ? "Now" : "After"}
                </th>
                {preview.cells.map((c) => {
                  const text = show(c, c[which]);
                  return (
                    <td
                      key={c.fieldName}
                      data-changed={c.changed ? "true" : undefined}
                      className={cn(
                        "max-w-[180px] truncate border-l px-2 py-1 align-top",
                        c.changed && which === "before" && "bg-red-50 text-red-700 line-through decoration-red-400/70 dark:bg-red-950/40 dark:text-red-300",
                        c.changed && which === "after" && "bg-emerald-50 font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                      )}
                      title={text || "empty"}
                    >
                      {text || <span className="italic text-muted-foreground/70 no-underline">empty</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {preview.changedCount === 0
          ? "Nothing on this row would change — every value is already what the action sets."
          : `${preview.changedCount} of ${preview.cells.length} cells change. Calculated columns show what they will work out to.`}
      </p>
    </div>
  );
}
