"use client";

/**
 * THE ARCHIVED PORTALS OF EVERY ORGANIZATION THE PERSON BELONGS TO (all-organizations home).
 *
 * `custom.list_portals_everywhere('archived')` answers each portal with its organization. A portal
 * is brought back from its clients table's own Portals rail (the organization it lives in), so each
 * row is a door to exactly that rail — never a control that would act in the header's organization.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecordsDataSource } from "@ai-matrx/records";
import { archivedPortalsEverywhere, type ArchivedPortalEverywhereRow } from "./doors";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export function ArchivedPortalsEverywhere({ dataSource }: { dataSource: RecordsDataSource }) {
  const [state, setState] = useState<
    { phase: "reading" } | { phase: "read"; rows: ArchivedPortalEverywhereRow[] } | { phase: "failed"; why: string }
  >({ phase: "reading" });
  useEffect(() => {
    let alive = true;
    void archivedPortalsEverywhere(dataSource).then((answered) => {
      if (!alive) return;
      setState(answered.ok ? { phase: "read", rows: answered.data } : { phase: "failed", why: answered.error.message });
    });
    return () => {
      alive = false;
    };
  }, [dataSource]);

  if (state.phase === "reading") return <p className="py-2 text-xs text-muted-foreground">Asking for archived portals…</p>;
  if (state.phase === "failed") {
    return (
      <p className="py-2 text-xs text-destructive" data-archive-read-trouble="">
        The archived portals did not answer, so nothing was read — this is not an empty archive. {state.why}
      <ErrorAlchemyMenu error={state.why} /></p>
    );
  }
  if (state.rows.length === 0) return <p className="py-2 text-xs text-muted-foreground">No portals have been archived.</p>;
  return (
    <div data-archived-portals-everywhere="">
      <p className="text-xs font-medium text-foreground">Archived portals ({state.rows.length})</p>
      <ul>
        {state.rows.map((row) => (
          <li key={row.portal_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-border py-2 first:border-t-0">
            <span className="text-sm text-foreground">{row.title || "(untitled portal)"}</span>
            {row.organization_name ? <span className="text-xs text-muted-foreground">{row.organization_name}</span> : null}
            <Link
              href={`/data/${row.client_table_id}?rail=portals&item=${row.portal_id}`}
              className="ml-auto text-xs text-primary underline-offset-2 hover:underline"
            >
              Open to bring it back
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
