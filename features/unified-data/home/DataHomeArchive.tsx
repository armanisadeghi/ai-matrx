"use client";

// features/unified-data/home/DataHomeArchive.tsx — LANE DATA-HOME-3A
//
// THE ARCHIVE UNDER THE LIST, kept from the old hub (census item 14): an "Archived (N)"
// disclosure, closed by default, with Bring back on each row, and the archived portals. One door
// for every organization (`custom.archived_tables_everywhere`); the page's organization filter
// narrows what is shown, and a restore asks the organization the row lives in. Folding this into
// the shell's archive axis is a later convergence, not this rebuild.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchivedDisclosure, refusal } from "@ai-matrx/records-ui";
import type { RecordsDataSource, RecordsError } from "@ai-matrx/records";

import * as doors from "@/features/unified-data/hub/doors";
import { ArchivedTablesList, type ArchivedTable } from "@/features/unified-data/hub/ArchivedTablesList";
import { ArchivedPortalsEverywhere } from "@/features/unified-data/hub/ArchivedPortalsEverywhere";

// NEVER THOUSANDS AT ONCE (DATA-HOME-3F; VERIFY-DATA-HOME-3 W4). The member's archive is 1,769
// Tables: drawn in one list it was 7,116 lines of text, and the second read hit the signed-in
// statement clock (57014). The archive is read 200 at a time — the first page answers fast, "Show
// more" asks for the next 200 — and the door serves at most 1000 a call (DATA-HOME-3B2).
export const ARCHIVE_PAGE = 200;

/**
 * The archive read's failure as a people-facing refusal (drawn by records-ui's RefusalNotice, which
 * runs `refusalForAPerson`). The statement timeout is ours to word — "canceling statement due to
 * statement timeout" is Postgres's sentence, never a person's — and its raw text rides out of sight.
 */
export function archiveReadRefusal(failure: doors.DoorFailure): RecordsError {
  if (failure.sqlstate === "57014") {
    return refusal(
      "timed_out",
      "The archive took too long to answer.",
      "Try again in a moment.",
      `SQLSTATE 57014. ${failure.message}`,
    );
  }
  return {
    code: "internal",
    message: failure.message,
    ...(failure.hint ? { hint: failure.hint } : {}),
    ...(failure.sqlstate ? { sqlstate: failure.sqlstate } : {}),
  } as RecordsError;
}

function toArchived(row: doors.ArchivedEverywhereRow): ArchivedTable {
  return {
    id: row.id,
    name: row.document?.name?.trim() || "(unnamed table)",
    archivedAt: row.archived_at ?? "",
    archivedByName: row.archived_by_name,
    organizationName: row.organization_name,
    organizationId: row.organization_id,
  };
}

export function DataHomeArchive({
  dataSource,
  organizationFilter,
}: {
  dataSource: RecordsDataSource;
  /** The page's organization filter; null = All organizations. */
  organizationFilter: string | null;
}) {
  const router = useRouter();
  const [tables, setTables] = useState<ArchivedTable[] | null>(null);
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trouble, setTrouble] = useState<RecordsError | null>(null);
  // A newer read (a restore, a retry) wins; an older answer arriving late is dropped.
  const generation = useRef(0);

  const readPage = useCallback(
    async (offset: number, prior: ArchivedTable[]) => {
      const mine = ++generation.current;
      setLoading(true);
      const answered = await doors.archivedTablesEverywhere(dataSource, { limit: ARCHIVE_PAGE, offset });
      if (mine !== generation.current) return;
      setLoading(false);
      if (!answered.ok) {
        setTrouble(archiveReadRefusal(answered.error));
        return;
      }
      setTrouble(null);
      setComplete(answered.data.length < ARCHIVE_PAGE);
      setTables([...prior, ...answered.data.map(toArchived)]);
    },
    [dataSource],
  );

  const read = useCallback(() => readPage(0, []), [readPage]);

  useEffect(() => {
    void read();
  }, [read]);

  const showMore = useCallback(() => {
    void readPage(tables?.length ?? 0, tables ?? []);
  }, [readPage, tables]);

  const retry = useCallback(() => {
    void readPage(tables?.length ?? 0, tables ?? []);
  }, [readPage, tables]);

  const shown = tables && organizationFilter ? tables.filter((t) => t.organizationId === organizationFilter) : tables;

  const bringBack = useCallback(
    async (tableId: string) => {
      const home = tables?.find((t) => t.id === tableId)?.organizationId;
      if (!home) return { code: "refused_by_rule" as const, message: "This table names no organization, so it cannot be brought back here." };
      const restored = await doors.restoreRecordIn(dataSource, home, tableId);
      if (!restored.ok) {
        return {
          code: "refused_by_rule" as const,
          message: restored.error.message,
          ...(restored.error.hint ? { hint: restored.error.hint } : {}),
        };
      }
      await read();
      router.refresh();
      return null;
    },
    [dataSource, tables, read, router],
  );

  return (
    <section data-data-home-archive="" className="rounded-lg border border-border bg-card p-3">
      {/* read-gate-exempt: a troubled first read shows no count; the list says the trouble inside */}
      {/* The count is said only when the whole archive is in hand; a partial count would be a guess. */}
      <ArchivedDisclosure noun="tables" count={complete && !trouble ? shown?.length : undefined}>
        <ArchivedTablesList
          tables={shown}
          readTrouble={null}
          readRefusal={trouble}
          onRetry={retry}
          note={null}
          more={complete ? null : { onShowMore: showMore, loading }}
          onBringBack={bringBack}
        />
      </ArchivedDisclosure>
      <div className="mt-2">
        <ArchivedPortalsEverywhere dataSource={dataSource} />
      </div>
    </section>
  );
}
