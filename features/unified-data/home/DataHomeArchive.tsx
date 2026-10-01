"use client";

// features/unified-data/home/DataHomeArchive.tsx — LANE DATA-HOME-3A
//
// THE ARCHIVE UNDER THE LIST, kept from the old hub (census item 14): an "Archived (N)"
// disclosure, closed by default, with Bring back on each row, and the archived portals. One door
// for every organization (`custom.archived_tables_everywhere`); the page's organization filter
// narrows what is shown, and a restore asks the organization the row lives in. Folding this into
// the shell's archive axis is a later convergence, not this rebuild.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchivedDisclosure } from "@ai-matrx/records-ui";
import type { RecordsDataSource } from "@ai-matrx/records";

import * as doors from "@/features/unified-data/hub/doors";
import { ArchivedTablesList, type ArchivedTable } from "@/features/unified-data/hub/ArchivedTablesList";
import { ArchivedPortalsEverywhere } from "@/features/unified-data/hub/ArchivedPortalsEverywhere";

const PAGE = 200;
const MAX_PAGES = 25;

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
  const [trouble, setTrouble] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const read = useCallback(async () => {
    const all: doors.ArchivedEverywhereRow[] = [];
    let complete = false;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const answered = await doors.archivedTablesEverywhere(dataSource, { limit: PAGE, offset: page * PAGE });
      if (!answered.ok) {
        setTrouble(answered.error.message);
        return;
      }
      all.push(...answered.data);
      if (answered.data.length < PAGE) {
        complete = true;
        break;
      }
    }
    setTrouble(null);
    setNote(complete ? null : `More than ${PAGE * MAX_PAGES} tables are archived; the newest ${PAGE * MAX_PAGES} are listed.`);
    setTables(
      all.map((row) => ({
        id: row.id,
        name: row.document?.name?.trim() || "(unnamed table)",
        archivedAt: row.archived_at ?? "",
        archivedByName: row.archived_by_name,
        organizationName: row.organization_name,
        organizationId: row.organization_id,
      })),
    );
  }, [dataSource]);

  useEffect(() => {
    void read();
  }, [read]);

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
      <ArchivedDisclosure noun="tables" count={trouble && tables === null ? undefined : shown?.length}>
        <ArchivedTablesList tables={shown} readTrouble={trouble} note={note} onBringBack={bringBack} />
      </ArchivedDisclosure>
      <div className="mt-2">
        <ArchivedPortalsEverywhere dataSource={dataSource} />
      </div>
    </section>
  );
}
