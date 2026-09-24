"use client";

// features/unified-data/hub/OrganizationScope.tsx — LANE ACCESS-IS-PERSONAL
//
// THE LIST SAYS WHICH ORGANIZATION IT IS FILTERED BY, AND OFFERS THE WAY OUT.
//
// THE OWNER'S LAW (2026-09-23): "The active org may filter LISTS on a page only if the page
// itself visually displays the specific org and clearly shows it is filtering for that org,
// with a way to change it or select all." The Data hub listed one organization's tables and
// never said which, so a member of three organizations saw a third of her tables and nothing
// told her the other two existed. The strip names the organization, opens the platform's ONE
// organization picker to change it, and offers "All my organizations" — every table she can
// open, grouped by where it lives, each opening at its own address whichever organization she
// is working in. The choice rides the address (`?scope=all`), so it can be bookmarked and sent.
//
// Champion: Linear's workspace switcher beside "All teams", and Slack's "All workspaces" —
// the filter is named where you look, and the unfiltered view is one click.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Layers } from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import type { RecordsDataSource } from "@ai-matrx/records";

import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";
import * as doors from "./doors";
import { WhereItLives } from "../where-it-lives/WhereItLives";

export function OrganizationScopeStrip({
  organizationName,
  showingAll,
  onShowAll,
  onShowOne,
}: {
  organizationName: string | null;
  showingAll: boolean;
  onShowAll: () => void;
  onShowOne: () => void;
}) {
  const [open, setOpen] = useState(false);
  const name = organizationName ?? "the organization you are working in";
  return (
    <div
      data-hub-scope={showingAll ? "all" : "one"}
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs"
    >
      {showingAll ? (
        <>
          <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            Showing tables from <span className="font-medium text-foreground">every organization you can open</span>
          </span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onShowOne}>
            Only {name}
          </Button>
        </>
      ) : (
        <>
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-muted-foreground">
            Showing what is in <span className="font-medium text-foreground">{name}</span>
          </span>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                Change
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              <OrganizationPickerPanel />
            </PopoverContent>
          </Popover>
          <span className="text-muted-foreground" aria-hidden>
            &middot;
          </span>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onShowAll}>
            All my organizations
          </Button>
        </>
      )}
    </div>
  );
}

type AllState =
  | { phase: "reading" }
  | { phase: "read"; groups: Array<{ organizationId: string; organizationName: string; member: boolean; tables: doors.TableICanOpenRow[] }> }
  | { phase: "failed"; why: string };

export function AllOrganizationsTables({ dataSource }: { dataSource: RecordsDataSource }) {
  const [state, setState] = useState<AllState>({ phase: "reading" });
  // A table moved from a row re-reads the list, so it shows under its new organization.
  const [reread, setReread] = useState(0);
  useEffect(() => {
    let alive = true;
    void doors.tablesICanOpen(dataSource).then((answered) => {
      if (!alive) return;
      if (!answered.ok) {
        setState({ phase: "failed", why: answered.error.message });
        return;
      }
      const byOrg = new Map<string, { organizationId: string; organizationName: string; member: boolean; tables: doors.TableICanOpenRow[] }>();
      for (const row of answered.data) {
        const group = byOrg.get(row.organization_id) ?? {
          organizationId: row.organization_id,
          organizationName: row.organization_name,
          member: row.member,
          tables: [],
        };
        group.tables.push(row);
        byOrg.set(row.organization_id, group);
      }
      const groups = [...byOrg.values()]
        .map((g) => ({ ...g, tables: g.tables.sort((a, b) => a.table_name.localeCompare(b.table_name)) }))
        .sort((a, b) => a.organizationName.localeCompare(b.organizationName));
      setState({ phase: "read", groups });
    });
    return () => {
      alive = false;
    };
  }, [dataSource, reread]);

  if (state.phase === "reading") {
    return <p className="text-xs text-muted-foreground">Reading the tables in every organization you can open&hellip;</p>;
  }
  if (state.phase === "failed") {
    return (
      <p className="text-xs text-muted-foreground">
        The tables across your organizations could not be read, so nothing is listed &mdash; this is not an answer
        about your access. {state.why}
      </p>
    );
  }
  if (state.groups.length === 0) {
    return <p className="text-xs text-muted-foreground">You have not been given a table in any organization yet.</p>;
  }
  const total = state.groups.reduce((n, g) => n + g.tables.length, 0);
  return (
    <div data-hub-all-organizations className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {total} {total === 1 ? "table" : "tables"} in {state.groups.length}{" "}
        {state.groups.length === 1 ? "organization" : "organizations"}. Each opens where it lives &mdash; you do not
        need to switch.
      </p>
      {state.groups.map((group) => (
        <section key={group.organizationId} className="rounded-lg border border-border bg-card">
          <header className="flex items-baseline gap-2 border-b border-border px-3 py-1.5">
            <span className="text-sm font-medium text-foreground">{group.organizationName}</span>
            <span className="text-xs text-muted-foreground">
              {group.member ? "" : "shared with you · "}
              {group.tables.length} {group.tables.length === 1 ? "table" : "tables"}
            </span>
          </header>
          <ul className="divide-y divide-border">
            {group.tables.map((table) => (
              <li key={table.table_id} className="flex items-center gap-2 px-3 py-1.5">
                <Link
                  href={`/data-v2/${table.table_id}`}
                  data-hub-all-table={table.table_id}
                  className="min-w-0 flex-1 truncate text-xs text-foreground underline-offset-2 hover:underline"
                >
                  {table.table_name}
                </Link>
                {/* WHERE IT LIVES, ON THE ROW, and — for its owner — where else it can go. */}
                <WhereItLives
                  variant="row"
                  dataSource={dataSource}
                  tableId={table.table_id}
                  knownOrganizationName={group.organizationName}
                  onMoved={() => setReread((n) => n + 1)}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
