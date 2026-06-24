"use client";

/**
 * ActionCatalogGrid — the "see everything in one place" matrix.
 *
 * Dense, scannable table: rows = nouns (grouped by family), columns = the live
 * verbs. Each cell is a color-coded {@link StateCell}. Filterable by family, by
 * free-text noun/table search, and by "writable only" (any of create/update/
 * delete wired). Optimized for density — this is a power-user admin surface.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StateBadge, StateCell } from "@/features/action-catalog/components/StateCell";
import type {
  ActionCatalog,
  ActionVerb,
  NounActions,
} from "@/features/action-catalog/types";

const ALL_FAMILIES = "__all__";

function isWritable(noun: NounActions): boolean {
  return (
    noun.create === "yes" ||
    noun.update === "yes" ||
    noun.delete === "yes"
  );
}

export function ActionCatalogGrid({ catalog }: { catalog: ActionCatalog }) {
  const verbs = catalog.verbs as ActionVerb[];

  const [familyFilter, setFamilyFilter] = useState<string>(ALL_FAMILIES);
  const [query, setQuery] = useState("");
  const [writableOnly, setWritableOnly] = useState(false);

  const families = useMemo(() => {
    const set = new Set<string>();
    for (const n of catalog.nouns) set.add(n.family);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog.nouns]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.nouns.filter((n) => {
      if (familyFilter !== ALL_FAMILIES && n.family !== familyFilter)
        return false;
      if (writableOnly && !isWritable(n)) return false;
      if (q) {
        const hay = `${n.noun} ${n.table} ${n.family}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog.nouns, familyFilter, query, writableOnly]);

  // Group filtered rows by family for the sectioned table.
  const grouped = useMemo(() => {
    const map = new Map<string, NounActions[]>();
    for (const n of filtered) {
      const arr = map.get(n.family) ?? [];
      arr.push(n);
      map.set(n.family, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, rows]) => ({
        family,
        rows: rows.sort((a, b) => a.noun.localeCompare(b.noun)),
      }));
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar + legend */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search noun / table…"
            className="h-8 w-56 pl-7 text-sm"
          />
        </div>

        <Select value={familyFilter} onValueChange={setFamilyFilter}>
          <SelectTrigger className="h-8 w-56 text-sm">
            <SelectValue placeholder="All families" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FAMILIES}>All families</SelectItem>
            {families.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={writableOnly}
            onChange={(e) => setWritableOnly(e.target.checked)}
            className="h-3.5 w-3.5 accent-primary"
          />
          Writable only
        </label>

        <span className="text-xs text-muted-foreground">
          {filtered.length} of {catalog.nouns.length} nouns
        </span>

        <div className="ml-auto flex items-center gap-2">
          <StateBadge state="yes" />
          <StateBadge state="planned" />
          <StateBadge state="no" />
        </div>
      </div>

      {/* The matrix */}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border text-left">
              <th className="px-3 py-1.5 font-medium text-muted-foreground">
                Noun
              </th>
              <th className="px-3 py-1.5 font-medium text-muted-foreground">
                Table
              </th>
              {verbs.map((v) => (
                <th
                  key={v}
                  className="w-20 px-2 py-1.5 text-center font-medium capitalize text-muted-foreground"
                >
                  {v}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(({ family, rows }) => (
              <FamilyGroup key={family} family={family} rows={rows} verbs={verbs} />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={verbs.length + 2}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No nouns match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FamilyGroup({
  family,
  rows,
  verbs,
}: {
  family: string;
  rows: NounActions[];
  verbs: ActionVerb[];
}) {
  return (
    <>
      <tr className="bg-muted/40">
        <td
          colSpan={verbs.length + 2}
          className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {family}
        </td>
      </tr>
      {rows.map((n) => (
        <tr
          key={n.noun}
          className={cn(
            "border-b border-border/60 hover:bg-accent/40 transition-colors",
          )}
        >
          <td className="px-3 py-1 font-medium text-foreground">{n.noun}</td>
          <td className="px-3 py-1 font-mono text-xs text-muted-foreground">
            {n.table}
          </td>
          {verbs.map((v) => (
            <td key={v} className="px-2 py-1">
              <StateCell state={n[v]} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
