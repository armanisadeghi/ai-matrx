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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StateBadge,
  StateCell,
} from "@/features/action-catalog/components/StateCell";
import type {
  ActionCatalog,
  ActionVerb,
  NounActions,
} from "@/features/action-catalog/types";
import type { ActionShapeSelection } from "@/features/action-catalog/components/ActionShapePanel";

const ALL_FAMILIES = "__all__";

function isWritable(noun: NounActions): boolean {
  return (
    noun.create === "yes" || noun.update === "yes" || noun.delete === "yes"
  );
}

export function ActionCatalogGrid({
  catalog,
  busyToggle,
  onToggleWritable,
  onInspect,
}: {
  catalog: ActionCatalog;
  busyToggle: string | null;
  onToggleWritable: (noun: NounActions, enabled: boolean) => void;
  onInspect: (selection: ActionShapeSelection) => void;
}) {
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
          <Checkbox
            checked={writableOnly}
            onCheckedChange={(checked) => setWritableOnly(checked === true)}
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
              <FamilyGroup
                key={family}
                family={family}
                rows={rows}
                verbs={verbs}
                busyToggle={busyToggle}
                onToggleWritable={onToggleWritable}
                onInspect={onInspect}
              />
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

        <FunctionsSection
          catalog={catalog}
          query={query}
          onInspect={onInspect}
        />
      </div>
    </div>
  );
}

/**
 * Plane-2 functions (registered custom procedures) + the deprecated legacy
 * named directives — the half of the system the noun × verb grid can't
 * represent. Fully server-derived (`catalog.functions`).
 */
function FunctionsSection({
  catalog,
  query,
  onInspect,
}: {
  catalog: ActionCatalog;
  query: string;
  onInspect: (selection: ActionShapeSelection) => void;
}) {
  const functions = catalog.functions ?? [];
  const q = query.trim().toLowerCase();
  const visible = q
    ? functions.filter((f) => `${f.name} ${f.doc ?? ""}`.toLowerCase().includes(q))
    : functions;
  if (visible.length === 0) return null;
  return (
    <div className="border-t border-border">
      <div className="bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Functions (Plane 2) &amp; legacy directives
      </div>
      <table className="w-full border-collapse text-sm">
        <tbody>
          {visible.map((f) => (
            <tr
              key={`${f.kind}:${f.name}`}
              className="cursor-pointer border-b border-border/60 transition-colors hover:bg-accent/40"
              onClick={() => onInspect({ kind: "function", fn: f })}
            >
              <td className="w-64 px-3 py-1 font-mono text-xs font-medium text-foreground">
                {f.name}
                {f.deprecated && (
                  <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                    legacy
                  </span>
                )}
              </td>
              <td className="px-3 py-1 text-xs text-muted-foreground">{f.doc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FamilyGroup({
  family,
  rows,
  verbs,
  busyToggle,
  onToggleWritable,
  onInspect,
}: {
  family: string;
  rows: NounActions[];
  verbs: ActionVerb[];
  busyToggle: string | null;
  onToggleWritable: (noun: NounActions, enabled: boolean) => void;
  onInspect: (selection: ActionShapeSelection) => void;
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
              <ActionStateCell
                noun={n}
                verb={v}
                busy={busyToggle === n.noun}
                onToggleWritable={onToggleWritable}
                onInspect={onInspect}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function ActionStateCell({
  noun,
  verb,
  busy,
  onToggleWritable,
  onInspect,
}: {
  noun: NounActions;
  verb: ActionVerb;
  busy: boolean;
  onToggleWritable: (noun: NounActions, enabled: boolean) => void;
  onInspect: (selection: ActionShapeSelection) => void;
}) {
  const state = noun[verb];
  const writeVerb =
    verb === "create" || verb === "update" || verb === "delete";
  const canToggle = writeVerb && state !== "no";
  const enabled = noun.create === "yes" || noun.update === "yes";
  const schema = noun.schemas?.[verb];

  return (
    <StateCell
      state={state}
      busy={busy}
      onToggle={
        canToggle ? () => onToggleWritable(noun, !enabled) : undefined
      }
      toggleLabel={
        canToggle
          ? `${enabled ? "Disable" : "Enable"} generic write actions for ${noun.noun}`
          : undefined
      }
      onInspect={
        schema
          ? () => onInspect({ kind: "action", noun, verb })
          : undefined
      }
      inspectLabel={`Inspect ${verb}:${noun.noun} shape`}
    />
  );
}
