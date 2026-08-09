"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { MatrxUuidCell } from "./MatrxUuidCell";
import { isUuidValue } from "@/components/official/entity-ref/doors";

/** No field is a door unless the caller says which token it points at. */
const noFieldToken = (): string | null => null;

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
 * inspector. UUID-shaped values use MatrxUuidCell (short + copy). Every field
 * row gets hover-revealed Copy + Copy-for-AI buttons (set `fieldCopy={false}`
 * to opt out). Pass a custom `renderView` / `renderDetail` to replace it.
 */
export function DataRowInspector<T = unknown>({
  row,
  title,
  className,
  fieldCopy = true,
  recordKind = "record",
  recordLabel,
  location,
  tokenForField = noFieldToken,
}: {
  row: T;
  title?: ReactNode;
  className?: string;
  /** Hover Copy + Copy-for-AI on every field row. Default true. */
  fieldCopy?: boolean;
  /** Stable slug for the record type, used in field agent payloads. */
  recordKind?: string;
  /** Human label for the record, used in toasts ("Backlink · anchor_text"). */
  recordLabel?: string;
  /** Where the user is, in words, for field agent payloads. */
  location?: string;
  /**
   * Maps one of this record's field names to the entity token its id points at,
   * turning that field into a door (route + peek).
   *
   * Defaults to NO doors, because this inspector renders arbitrary tables and a
   * wrong door opens a different record. A caller that has checked its FKs can
   * pass `tokenFromColumnName` (from `components/official/entity-ref/doors`) to
   * open every `<token>_id` field, or its own stricter map.
   */
  tokenForField?: (key: string, row: T) => string | null;
}) {
  const entries = isPlainObject(row)
    ? Object.entries(row)
    : [["value", row] as const];

  const fieldButtons = (key: string, value: unknown) =>
    fieldCopy ? (
      <div className="absolute right-1 top-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/field:opacity-100">
        <CopyButtons
          size="xs"
          label={recordLabel ? `${recordLabel} · ${key}` : key}
          human={() => formatValue(value)}
          agent={() => ({
            kind: `${recordKind}-field`,
            location: location ?? "Data row inspector",
            description: `The "${key}" field of one ${recordLabel ?? recordKind}.`,
            data: { field: key, value, record: row },
            attributes: { field: key },
          })}
        />
      </div>
    ) : null;

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
                  className="group/field relative grid grid-cols-[minmax(7rem,9rem)_1fr] gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
                >
                  <dt className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {key}
                  </dt>
                  <dd className="min-w-0">
                    <MatrxUuidCell
                      value={value}
                      label={key}
                      token={tokenForField(key, row)}
                    />
                  </dd>
                </div>
              );
            }

            const formatted = formatValue(value);
            const multiline = formatted.includes("\n") || formatted.length > 80;
            return (
              <div
                key={key}
                className="group/field relative grid grid-cols-[minmax(7rem,9rem)_1fr] gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
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
                {fieldButtons(key, value)}
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}
