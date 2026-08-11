"use client";

import type { ContextItemBodyProps } from "../types";

function displayValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null) return "null";
  if (value === undefined) return "—";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
}

/** Read-only view of the exact context snapshot sent with a message. */
export function ContextInputBody({ item }: ContextItemBodyProps) {
  const snapshot = item.refs.contextInput;
  if (!snapshot) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No saved context snapshot is available.
      </div>
    );
  }

  const entries = Object.entries(snapshot.data);
  return (
    <div className="h-full overflow-y-auto p-4">
      {snapshot.id ? (
        <p className="mb-3 text-xs text-muted-foreground">
          Snapshot ID: {snapshot.id}
        </p>
      ) : null}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This context snapshot contains no fields.
        </p>
      ) : (
        <dl className="divide-y divide-border/70">
          {entries.map(([key, value]) => (
            <div key={key} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="text-xs font-medium text-muted-foreground">
                {key}
              </dt>
              <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-foreground">
                {displayValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
