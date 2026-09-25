"use client";

/**
 * THE ORGANIZATION'S ARCHIVED TABLES, WITH THE WAY BACK ON EACH ROW.
 *
 * 🚨 A REFUSED "BRING IT BACK" IS NOT A FAILED READ (UI-FIX-19, VERIFIER-19 #4). The hub put a
 * refused restore into the same slot as a failed archive read, so one refusal emptied the whole
 * list and printed "The archive did not answer, so nothing was read" although the archive had
 * answered. Two different things, two different places:
 *
 *   - `readTrouble` — the archive itself did not answer. Nothing can be listed, and the page says
 *     so (it is not an empty archive).
 *   - a REFUSAL — the archive answered and the store refused one row's restore. The list stays, and
 *     the refusal is drawn ON THAT ROW, in the store's own words, through records-ui's one
 *     `RefusalNotice` (the same notice a table's own "Bring it back" draws). The store names the
 *     fix itself: "…takes its choices from "Status choices", which is archived - bring "Status
 *     choices" back first…", and "Status choices" is right there in the same list.
 */
import { useState } from "react";
import { RefusalNotice } from "@ai-matrx/records-ui";
import type { RecordsError } from "@ai-matrx/records";
import { Button } from "@ai-matrx/design-system";

/** An archived Table, with the one thing a person wants to do to it. */
export interface ArchivedTable {
  id: string;
  name: string;
  archivedAt: string;
  archivedByName: string | null;
}

export interface ArchivedTablesListProps {
  /** `null` while the archive is being read. */
  tables: readonly ArchivedTable[] | null;
  /** The archive READ did not answer — never a refused restore. */
  readTrouble: string | null;
  /** Said when the archive is bigger than one visit reads. Never a failure. */
  note: string | null;
  /** Bring one table back. Answers `null` when it came back, or the store's refusal. */
  onBringBack: (tableId: string) => Promise<RecordsError | null>;
}

export function ArchivedTablesList({ tables, readTrouble, note, onBringBack }: ArchivedTablesListProps) {
  const [restoring, setRestoring] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ tableId: string; error: RecordsError } | null>(null);

  async function bringBack(tableId: string) {
    setRestoring(tableId);
    setRefused(null);
    const error = await onBringBack(tableId);
    setRestoring(null);
    if (error) setRefused({ tableId, error });
  }

  return (
    <>
      {note ? <p className="py-2 text-xs text-muted-foreground">{note}</p> : null}
      {readTrouble ? (
        <p className="py-2 text-xs text-destructive" data-archive-read-trouble="">
          The archive did not answer, so nothing was read — this is not an empty archive.{" "}
          {readTrouble}
        </p>
      ) : tables === null ? (
        <p className="py-2 text-xs text-muted-foreground">Asking the store&rsquo;s archive…</p>
      ) : tables.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">
          Nothing has been archived here. Archiving a table takes it out of everyone&rsquo;s list
          and keeps its records, so it can always come back.
        </p>
      ) : (
        <ul data-archived-tables="">
          {tables.map((table) => (
            <li
              key={table.id}
              data-archived-table={table.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0"
            >
              <span className="text-sm text-foreground">{table.name}</span>
              <span className="text-xs text-muted-foreground">
                {table.archivedByName ? `${table.archivedByName}, ` : ""}
                {new Date(table.archivedAt).toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={restoring === table.id}
                onClick={() => void bringBack(table.id)}
              >
                {restoring === table.id ? "Bringing it back…" : "Bring it back"}
              </Button>
              {refused?.tableId === table.id ? (
                <div className="basis-full" data-archived-table-refusal={table.id}>
                  <RefusalNotice error={refused.error} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
