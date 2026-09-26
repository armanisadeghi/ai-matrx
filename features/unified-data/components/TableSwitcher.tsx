"use client";

// features/unified-data/components/TableSwitcher.tsx — lane TABLE-PAGE-CHROME
//
// THE TABLE'S NAME IS THE SWITCHER (owner, 2026-09-25: "Enable clickable table title to switch
// between tables"). The /data-v2/<table> header carries the table's name as the ONE identity
// control, the way /data/<id> (`TableIdentityMenu`) and /agents/<id> do: press it and the tables
// this person can open in the table's organization are listed, with search, and "All tables".
// Where the table lives (and Move) sits at the foot of the same popover, so the organization is
// never a second line of chrome on the page (Notion's breadcrumb "Move to"; Linear's team menu).
//
// The list is the record store's own (`useTables`, `custom.table_list`), read inside the page's
// RecordsMount — the organization the TABLE lives in, never the active one.

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronDown, LayoutGrid, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { useTables } from "@ai-matrx/records/react";
import { cn } from "@/lib/utils";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface TableSwitcherProps {
  tableId: string;
  /** The table's name as the page read it (the trigger's words). */
  name: string;
  /** Where "All tables" goes: the table organization's list. */
  allTablesHref: string;
  /** Said at the foot of the list — where the table lives, the level it was shared at, Move. */
  footer?: ReactNode;
}

/** The tables a search keeps, in the order the store listed them. Pure. */
export function tablesMatching<T extends { name?: string | null }>(tables: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...tables];
  return tables.filter((t) => (t.name ?? "").toLowerCase().includes(q));
}

export function TableSwitcher({ tableId, name, allTablesHref, footer }: TableSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const tables = useTables();
  const listed = useMemo(
    () => tablesMatching((tables.data ?? []).filter((t) => (t.name ?? "").trim() !== ""), query),
    [tables.data, query],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${name}. Switch table`}
          data-table-switcher=""
          className="flex min-w-0 max-w-[55vw] items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors hover:bg-[var(--matrx-glass-bg-active)] sm:max-w-[28rem]"
        >
          <span className="truncate text-sm font-medium text-foreground">{name}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent sizing="content" align="start" sideOffset={8} className="p-1" data-table-switcher-content="">
        <div className="relative px-1 pb-1 pt-0.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a table"
            aria-label="Find a table"
            className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-primary sm:text-xs"
          />
        </div>
        <div className="max-h-[50dvh] overflow-y-auto" role="list" aria-label="Tables">
          {tables.loading ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">Reading your tables…</p>
          ) : tables.error ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              The list of tables could not be read right now. All tables still opens it.
              <ErrorAlchemyMenu />
            </p>
          ) : listed.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No table is called that.</p>
          ) : (
            listed.map((table) => {
              const current = table.id === tableId;
              return (
                <Link
                  key={table.id}
                  role="listitem"
                  href={`/data-v2/${table.id}`}
                  onClick={() => setOpen(false)}
                  aria-current={current ? "page" : undefined}
                  data-table-switcher-item={table.id}
                  className={cn(
                    "flex min-h-8 items-center gap-2 rounded-sm px-2 text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground",
                    current && "font-medium",
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", current ? "text-primary" : "opacity-0")} aria-hidden="true" />
                  <span className="truncate">{table.name}</span>
                </Link>
              );
            })
          )}
        </div>
        <div className="mt-1 border-t border-border pt-1">
          <Link
            href={allTablesHref}
            onClick={() => setOpen(false)}
            data-table-switcher-all=""
            className="flex min-h-8 items-center gap-2 rounded-sm px-2 text-xs text-popover-foreground hover:bg-accent hover:text-accent-foreground"
          >
            <LayoutGrid className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            All tables
          </Link>
        </div>
        {footer ? <div className="mt-1 border-t border-border px-2 py-1.5 text-xs" data-table-switcher-footer="">{footer}</div> : null}
      </PopoverContent>
    </Popover>
  );
}
