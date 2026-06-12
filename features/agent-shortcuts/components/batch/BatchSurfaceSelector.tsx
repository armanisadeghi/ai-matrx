"use client";

import { useMemo, useState } from "react";
import { Layers, PencilLine, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { SurfaceWithStats } from "@/features/surfaces/services/surfaces.service";

const ALL_CLIENTS = "__all__";

function splitSurfaceName(fullName: string): { client: string; local: string } {
  const idx = fullName.indexOf("/");
  if (idx < 0) return { client: "", local: fullName };
  return { client: fullName.slice(0, idx), local: fullName.slice(idx + 1) };
}

function prettify(s: string): string {
  return s
    .split(/[-_/]/g)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** An existing shortcut for the agent that can be updated. */
export interface UpdateCandidate {
  shortcutId: string;
  label: string;
  surfaceName: string;
}

interface Row {
  key: string; // create:<surface> | update:<shortcutId>
  kind: "create" | "update";
  title: string;
  subtitle: string;
  valueCount?: number;
  alreadyHasShortcut?: boolean;
  isTemplate?: boolean;
}

interface Props {
  /** Catalog surfaces (the "add" universe). */
  surfaces: readonly SurfaceWithStats[];
  loading: boolean;
  /** Surface names that already have a shortcut for this agent. */
  existingSurfaceNames: ReadonlySet<string>;
  /** The surface of the chosen template — excluded from "select visible". */
  templateSurfaceName: string | null;
  /** Existing shortcuts (already excludes the chosen template). */
  updateCandidates: readonly UpdateCandidate[];
  /** Selected keys (prefixed). */
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onSetSelection: (keys: string[]) => void;
}

export function BatchSurfaceSelector({
  surfaces,
  loading,
  existingSurfaceNames,
  templateSurfaceName,
  updateCandidates,
  selected,
  onToggle,
  onSetSelection,
}: Props) {
  const [client, setClient] = useState<string>(ALL_CLIENTS);
  const [query, setQuery] = useState("");

  const clients = useMemo(() => {
    const set = new Set<string>();
    for (const s of surfaces) set.add(s.client_name);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [surfaces]);

  const q = query.trim().toLowerCase();

  const addRows = useMemo<Row[]>(
    () =>
      surfaces
        .filter((s) =>
          client === ALL_CLIENTS ? true : s.client_name === client,
        )
        .filter((s) => (q ? s.name.toLowerCase().includes(q) : true))
        .map((s) => ({
          key: `create:${s.name}`,
          kind: "create" as const,
          title: prettify(splitSurfaceName(s.name).local),
          subtitle: s.name,
          valueCount: s.surfaceValueCount,
          alreadyHasShortcut: existingSurfaceNames.has(s.name),
          isTemplate: templateSurfaceName === s.name,
        })),
    [surfaces, client, q, existingSurfaceNames, templateSurfaceName],
  );

  const updateRows = useMemo<Row[]>(
    () =>
      updateCandidates
        .filter((c) =>
          q
            ? c.label.toLowerCase().includes(q) ||
              c.surfaceName.toLowerCase().includes(q)
            : true,
        )
        .map((c) => ({
          key: `update:${c.shortcutId}`,
          kind: "update" as const,
          title: c.label || prettify(splitSurfaceName(c.surfaceName).local),
          subtitle: c.surfaceName,
        })),
    [updateCandidates, q],
  );

  const visibleKeys = useMemo(
    () => [...addRows, ...updateRows].map((r) => r.key),
    [addRows, updateRows],
  );
  // "Select visible" never auto-selects the template's own surface — it would
  // always be a perfect match and just create a duplicate. It can still be
  // ticked manually.
  const selectableKeys = useMemo(
    () =>
      [...addRows, ...updateRows]
        .filter((r) => !r.isTemplate)
        .map((r) => r.key),
    [addRows, updateRows],
  );
  const selectedVisible = selectableKeys.filter((k) => selected.has(k)).length;
  const allVisibleSelected =
    selectableKeys.length > 0 && selectedVisible === selectableKeys.length;

  const selectAllVisible = () => {
    const next = new Set(selected);
    for (const k of selectableKeys) next.add(k);
    onSetSelection(Array.from(next));
  };
  const clearVisible = () => {
    const next = new Set(selected);
    for (const k of visibleKeys) next.delete(k);
    onSetSelection(Array.from(next));
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 p-2 border-b border-border">
        <Select value={client} onValueChange={setClient} disabled={loading}>
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLIENTS}>All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c} value={c}>
                {prettify(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search surfaces & shortcuts…"
            className="h-8 pl-8 text-sm"
            style={{ fontSize: "16px" }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={allVisibleSelected ? clearVisible : selectAllVisible}
          disabled={loading || visibleKeys.length === 0}
        >
          {allVisibleSelected ? "Clear visible" : "Select visible"}
        </Button>
      </div>

      {/* Count strip */}
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground border-b border-border bg-muted/30">
        <span>
          {selected.size} selected · {visibleKeys.length} shown
        </span>
        {loading && <span>Loading…</span>}
      </div>

      {/* Lists */}
      <div className="max-h-80 overflow-y-auto">
        {visibleKeys.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {loading ? "Loading…" : "Nothing matches your filters."}
          </div>
        ) : (
          <>
            {updateRows.length > 0 && (
              <SectionLabel
                icon={PencilLine}
                label="Update existing"
                count={updateRows.length}
              />
            )}
            <RowList
              rows={updateRows}
              selected={selected}
              onToggle={onToggle}
            />

            {addRows.length > 0 && (
              <SectionLabel
                icon={Plus}
                label="Add new shortcut"
                count={addRows.length}
              />
            )}
            <RowList rows={addRows} selected={selected} onToggle={onToggle} />
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({
  icon: Icon,
  label,
  count,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
}) {
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1.5 px-3 py-1 bg-muted/70 backdrop-blur-sm border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
      <span className="text-muted-foreground/70">· {count}</span>
    </div>
  );
}

function RowList({
  rows,
  selected,
  onToggle,
}: {
  rows: Row[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {rows.map((item) => {
        const isSelected = selected.has(item.key);
        return (
          <li key={item.key}>
            {/* Clickable row is a div (not a button) so the inner Checkbox
                button is not nested inside another button. */}
            <div
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => onToggle(item.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle(item.key);
                }
              }}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors outline-none",
                isSelected ? "bg-primary/5" : "hover:bg-accent/50",
                "focus-visible:ring-1 focus-visible:ring-primary",
              )}
            >
              <Checkbox checked={isSelected} className="pointer-events-none" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground truncate">
                    {item.title}
                  </span>
                  {item.isTemplate && (
                    <span className="shrink-0 inline-flex items-center h-4 px-1 rounded text-[9px] font-medium text-primary bg-primary/10 border border-primary/30">
                      template
                    </span>
                  )}
                  {item.kind === "create" && item.alreadyHasShortcut && (
                    <span className="shrink-0 inline-flex items-center h-4 px-1 rounded text-[9px] font-medium text-amber-600 bg-amber-500/10 border border-amber-300/60 dark:border-amber-800">
                      has one
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono truncate">
                  {item.subtitle}
                </div>
              </div>
              {item.valueCount !== undefined && (
                <span className="shrink-0 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Layers className="h-3 w-3" />
                  {item.valueCount}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
