"use client";

/**
 * The record store's half of a table page's alchemy capture (lane
 * ALCHEMY-BUTTON): called INSIDE the page's `RecordsMount`, it names the table
 * (the route knows only its id), hands over the table's declaration, and makes
 * the records and the open record readable at copy time — through the same
 * door the grid reads (`custom.read_records`), as the person, with the same
 * filter the address carries. Nothing is read while the page is only open: the
 * grid's own read is not duplicated.
 */

import { useRecordsClient } from "@ai-matrx/records/react";
import type { RecordFilter } from "@ai-matrx/records";
import { usePageCaptureContribution } from "@/components/agent-copy/page-capture/usePageCapture";
import type { PageCaptureSection } from "@/components/agent-copy/page-capture/pageCapture";

/** How many records a "with the records" copy reads — the store's own page ceiling decides beyond. */
export const TABLE_CAPTURE_RECORD_LIMIT = 200;

type Answer<T> = { ok: true; data: T } | { ok: false; error: { message?: string } | unknown };

function unwrap<T>(answer: Answer<T>, what: string): T {
  if (answer.ok) return answer.data;
  const err = answer.error as { message?: string } | null;
  throw new Error(`${what}: ${err?.message ?? "the store refused"}`);
}

export function useTableCaptureContribution(opts: {
  tableId: string;
  /** The table's declaration as the page already read it (`useTable`). */
  table: { name?: string | null } | null;
  tableError?: string | null;
  filter?: RecordFilter | null;
  recordId?: string | null;
}): void {
  const client = useRecordsClient();
  const { tableId, table, tableError, filter, recordId } = opts;
  const name = table?.name?.trim() || null;

  usePageCaptureContribution(
    "records:table",
    () => {
      const sections: PageCaptureSection[] = [
        {
          id: "table",
          title: "Table declaration",
          description: "The table's fields and settings, as the record store declares them.",
          role: "data",
          value: table ?? (tableError ? `The table could not be read: ${tableError}` : "The table is still loading."),
          brief: name ? `Table ${name}` : "Table",
        },
        {
          id: "records",
          title: "Records",
          description: `Up to ${TABLE_CAPTURE_RECORD_LIMIT} records through the grid's own door${filter ? ", narrowed by the address's filter" : ""}; the grid's sort may order them differently.`,
          role: "data",
          value: `Not in the quick copy. Choose "Everything, with records" or "Only the data" to read up to ${TABLE_CAPTURE_RECORD_LIMIT} now.`,
          load: async () => {
            const page = unwrap(
              (await client.list({
                table_id: tableId,
                ...(filter ? { filter } : {}),
                limit: TABLE_CAPTURE_RECORD_LIMIT,
              })) as Answer<{ rows: unknown[]; total: number | null }>,
              "The records could not be read",
            );
            return {
              count: page.rows.length,
              limit: TABLE_CAPTURE_RECORD_LIMIT,
              more_may_exist: page.rows.length >= TABLE_CAPTURE_RECORD_LIMIT,
              rows: page.rows,
            };
          },
        },
      ];
      if (recordId) {
        sections.push({
          id: "open-record",
          title: "Open record",
          description: "The record open in the peek (?record=).",
          role: "data",
          value: `Record ${recordId}; choose a "with" copy to read its values.`,
          load: async () =>
            unwrap(
              (await client.listByIds({ table_id: tableId, ids: [recordId] })) as Answer<unknown[]>,
              "The open record could not be read",
            )[0] ?? `Record ${recordId} is not readable by you, or no longer exists.`,
        });
      }
      return { sections, identity: { Table: { id: tableId, name } } };
    },
    `${tableId}|${name}|${tableError}|${recordId}|${filter ? JSON.stringify(filter) : ""}`,
  );
}
