// features/kg-suggestions/components/manager/SuggestionsFilterBar.tsx
//
// The manager's filter rail. Status is a row of toggle chips (multi-select);
// everything else is a compact select / toggle. Org / scope-type / scope / item
// option lists are derived from the loaded result rows (the free-text search
// covers anything off the current page). All changes flow up via `patchQuery`,
// which resets pagination to the first page.

"use client";

import { Search, Star, Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils/cn";
import type {
  KgEnrichedSuggestionRow,
  KgSuggestionStatus,
  KgSuggestionsQuery,
} from "@/features/kg-suggestions/types";

const STATUSES: { value: KgSuggestionStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "deferred", label: "Deferred" },
  { value: "expired", label: "Expired" },
];

const ALL = "__all__";

export interface SuggestionsFilterBarProps {
  query: KgSuggestionsQuery;
  patchQuery: (patch: Partial<KgSuggestionsQuery>) => void;
  rows: KgEnrichedSuggestionRow[];
}

function distinct<T extends string>(
  rows: KgEnrichedSuggestionRow[],
  pick: (r: KgEnrichedSuggestionRow) => { id: T | null; label: string | null },
): { id: T; label: string }[] {
  const map = new Map<T, string>();
  for (const r of rows) {
    const { id, label } = pick(r);
    if (id && !map.has(id)) map.set(id, label ?? id);
  }
  return Array.from(map.entries())
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function SuggestionsFilterBar({
  query,
  patchQuery,
  rows,
}: SuggestionsFilterBarProps) {
  const statuses = query.statuses ?? [];
  const toggleStatus = (s: KgSuggestionStatus) => {
    const next = statuses.includes(s)
      ? statuses.filter((x) => x !== s)
      : [...statuses, s];
    patchQuery({ statuses: next });
  };

  const orgs = distinct(rows, (r) => ({ id: r.orgName, label: r.orgName }));
  const scopeTypes = distinct(rows, (r) => ({
    id: r.scopeTypeId,
    label: r.scopeTypeLabel,
  }));
  const scopes = distinct(rows, (r) => ({
    id: r.target.scope_id,
    label: r.scopeName,
  }));
  const items = distinct(rows, (r) => ({
    id: r.target.scope_item_id,
    label: r.itemLabel,
  }));
  const sourceKinds = distinct(rows, (r) => ({
    id: r.source_kind,
    label: r.source_kind,
  }));

  const hasActiveFilters =
    (query.search ?? "") !== "" ||
    !!query.orgId ||
    !!query.scopeTypeId ||
    !!query.scopeId ||
    !!query.itemId ||
    !!query.sourceKind ||
    query.minConfidence != null ||
    !!query.starredOnly ||
    !!query.unseenOnly ||
    (query.stage ?? "all") !== "all" ||
    !(statuses.length === 1 && statuses[0] === "pending");

  const clearAll = () =>
    patchQuery({
      statuses: ["pending"],
      stage: "all",
      orgId: null,
      scopeTypeId: null,
      scopeId: null,
      itemId: null,
      sourceKind: null,
      matchKind: null,
      minConfidence: null,
      starredOnly: false,
      unseenOnly: false,
      search: null,
    });

  return (
    <div className="space-y-2 border-b border-border bg-card/40 px-3 py-2">
      {/* Row 1: status chips + search */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUSES.map((s) => {
          const active = statuses.includes(s.value);
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => toggleStatus(s.value)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {s.label}
            </button>
          );
        })}

        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query.search ?? ""}
            onChange={(e) => patchQuery({ search: e.target.value || null })}
            placeholder="Search value, scope, field…"
            className="h-8 pl-7 text-base sm:text-xs"
            style={{ fontSize: "16px" }}
          />
        </div>
      </div>

      {/* Row 2: dimension selects + toggles */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterSelect
          label="Stage"
          value={query.stage ?? "all"}
          onChange={(v) =>
            patchQuery({
              stage: v === ALL ? "all" : (v as "value" | "association"),
            })
          }
          options={[
            { id: "value", label: "Field value" },
            { id: "association", label: "Scope link" },
          ]}
          allLabel="Any stage"
        />
        <FilterSelect
          label="Org"
          value={query.orgId ?? ALL}
          onChange={(v) => patchQuery({ orgId: v === ALL ? null : v })}
          options={orgs}
          allLabel="All orgs"
        />
        <FilterSelect
          label="Type"
          value={query.scopeTypeId ?? ALL}
          onChange={(v) => patchQuery({ scopeTypeId: v === ALL ? null : v })}
          options={scopeTypes}
          allLabel="All types"
        />
        <FilterSelect
          label="Scope"
          value={query.scopeId ?? ALL}
          onChange={(v) => patchQuery({ scopeId: v === ALL ? null : v })}
          options={scopes}
          allLabel="All scopes"
        />
        <FilterSelect
          label="Field"
          value={query.itemId ?? ALL}
          onChange={(v) => patchQuery({ itemId: v === ALL ? null : v })}
          options={items}
          allLabel="All fields"
        />
        <FilterSelect
          label="Source"
          value={query.sourceKind ?? ALL}
          onChange={(v) => patchQuery({ sourceKind: v === ALL ? null : v })}
          options={sourceKinds}
          allLabel="All sources"
        />
        <FilterSelect
          label="Confidence"
          value={
            query.minConfidence != null ? String(query.minConfidence) : ALL
          }
          onChange={(v) =>
            patchQuery({ minConfidence: v === ALL ? null : Number(v) })
          }
          options={[
            { id: "0.9", label: "≥ 90%" },
            { id: "0.7", label: "≥ 70%" },
            { id: "0.5", label: "≥ 50%" },
          ]}
          allLabel="Any confidence"
        />

        <ToggleChip
          active={!!query.starredOnly}
          onClick={() => patchQuery({ starredOnly: !query.starredOnly })}
          icon={<Star className="h-3 w-3" />}
          label="Starred"
        />
        <ToggleChip
          active={!!query.unseenOnly}
          onClick={() => patchQuery({ unseenOnly: !query.unseenOnly })}
          icon={<Sparkles className="h-3 w-3" />}
          label="Unseen"
        />

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
  allLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[7rem] gap-1 text-[11px]">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL} className="text-xs">
          {allLabel}
        </SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ToggleChip({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
        active
          ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-border text-muted-foreground hover:bg-accent",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default SuggestionsFilterBar;
