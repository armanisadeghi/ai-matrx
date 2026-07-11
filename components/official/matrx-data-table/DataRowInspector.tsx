"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { isUuidValue, MatrxUuidCell } from "./MatrxUuidCell";

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "string") return value || "—";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date)
  );
}

/**
 * Default detail / window View body for any row. Renders a scannable key/value
 * inspector. UUID-shaped values use MatrxUuidCell (short + copy). Pass a custom
 * `renderView` / `renderDetail` to replace it.
 */
export function DataRowInspector({
  row,
  title,
  className,
}: {
  row: unknown;
  title?: ReactNode;
  className?: string;
}) {
  const entries = isPlainObject(row)
    ? Object.entries(row)
    : [["value", row] as const];

  return (
    <div
      className={cn("flex h-full min-h-0 flex-col overflow-hidden", className)}
    >
      {title ? (
        <div className="shrink-0 border-b border-border px-3 py-2 text-sm font-medium">
          {title}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto p-3">
        <dl className="space-y-2">
          {entries.map(([key, value]) => {
            if (isUuidValue(value)) {
              return (
                <div
                  key={key}
                  className="grid grid-cols-[minmax(7rem,9rem)_1fr] gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
                >
                  <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {key}
                  </dt>
                  <dd className="min-w-0">
                    <MatrxUuidCell value={value} label={key} />
                  </dd>
                </div>
              );
            }

            const formatted = formatValue(value);
            const multiline = formatted.includes("\n") || formatted.length > 80;
            return (
              <div
                key={key}
                className="grid grid-cols-[minmax(7rem,9rem)_1fr] gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
              >
                <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {key}
                </dt>
                <dd
                  className={cn(
                    "min-w-0 text-sm text-foreground break-words",
                    multiline &&
                      "whitespace-pre-wrap font-mono text-xs leading-relaxed",
                  )}
                >
                  {formatted}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}
