"use client";

// A compact, read-only view of a document's properties (its front matter).
// Renders nothing when the document has none; an unreadable block says why.

import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDocumentProperties } from "../useDocumentProperties";

function show(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(show).join(", ");
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DocumentPropertiesPanel({ source, className }: { source: string; className?: string }) {
  const { properties, format, error } = useDocumentProperties(source);
  const entries = Object.entries(properties);
  if (!format) return null;
  return (
    <section
      aria-label="Document properties"
      data-document-properties=""
      className={cn("rounded-md border border-border bg-muted/30 px-3 py-2 text-xs", className)}
    >
      <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
        Properties <span className="font-normal normal-case">· {format.toUpperCase()}</span>
      </p>
      {error ? (
        <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">The properties block is empty.</p>
      ) : (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="font-medium text-muted-foreground">{key}</dt>
              <dd className="min-w-0 break-words text-foreground">{show(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
