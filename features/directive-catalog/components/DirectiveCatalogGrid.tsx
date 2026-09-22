"use client";

/**
 * DirectiveCatalogGrid — the live noun × verb matrix on MatrxDataTable.
 *
 * Source-owned controls keep the existing search across the noun matrix and
 * the separate Plane-2 action list. Plane-2 actions are not noun × verb rows,
 * so merging them would misrepresent their shape and lose doc search.
 */

import { useMemo, useState } from "react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Input } from "@ai-matrx/design-system";
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
} from "@/features/directive-catalog/components/StateCell";
import {
  DIRECTIVE_VERBS,
  type DirectiveCatalog,
  type DirectiveVerb,
  type NounDirectives,
} from "@/features/directive-catalog/types";
import type { DirectiveShapeSelection } from "@/features/directive-catalog/components/DirectiveShapePanel";

const ALL_FAMILIES = "__all__";

function isWritable(noun: NounDirectives): boolean {
  return (
    noun.create === "yes" || noun.update === "yes" || noun.delete === "yes"
  );
}

export function DirectiveCatalogGrid({
  catalog,
  busyToggle,
  onToggleWritable,
  onInspect,
}: {
  catalog: DirectiveCatalog;
  busyToggle: string | null;
  onToggleWritable: (noun: NounDirectives, enabled: boolean) => void;
  onInspect: (selection: DirectiveShapeSelection) => void;
}) {
  const [familyFilter, setFamilyFilter] = useState<string>(ALL_FAMILIES);
  const [query, setQuery] = useState("");
  const [writableOnly, setWritableOnly] = useState(false);

  const families = useMemo(() => {
    const set = new Set<string>();
    for (const noun of catalog.nouns) set.add(noun.family);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog.nouns]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return catalog.nouns.filter((noun) => {
      if (familyFilter !== ALL_FAMILIES && noun.family !== familyFilter)
        return false;
      if (writableOnly && !isWritable(noun)) return false;
      return (
        !normalizedQuery ||
        `${noun.noun} ${noun.table} ${noun.family}`
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [catalog.nouns, familyFilter, query, writableOnly]);

  const columns = useMemo((): MatrxColumnDef<NounDirectives>[] => {
    const matrixColumns: MatrxColumnDef<NounDirectives>[] = [
      {
        id: "noun",
        accessorKey: "noun",
        header: "Noun",
        label: "Noun",
        width: 180,
        frozen: true,
        cell: (noun) => <span className="font-medium">{noun.noun}</span>,
      },
      {
        id: "table",
        accessorKey: "table",
        header: "Table",
        label: "Table",
        width: 220,
        cell: (noun) => (
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {noun.table}
          </span>
        ),
      },
      {
        id: "family",
        accessorKey: "family",
        header: "Family",
        label: "Family",
        hidden: true,
      },
    ];
    for (const verb of DIRECTIVE_VERBS) {
      matrixColumns.push({
        id: verb,
        accessorKey: verb,
        header: verb[0].toUpperCase() + verb.slice(1),
        label: verb,
        width: 80,
        align: "center",
        compact: true,
        cell: (noun) => (
          <DirectiveStateCell
            noun={noun}
            verb={verb}
            busy={busyToggle === noun.noun}
            onToggleWritable={onToggleWritable}
            onInspect={onInspect}
          />
        ),
      });
    }
    return matrixColumns;
  }, [busyToggle, onInspect, onToggleWritable]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MatrxDataTable<NounDirectives>
        data={filtered}
        columns={columns}
        getRowId={(noun) => noun.noun}
        defaultSort={{ id: "noun", direction: "asc" }}
        pageSize={0}
        hidePagination
        detail={{ enabled: false }}
        grouping={{
          columnId: "family",
          groupableColumnIds: ["family"],
          order: "value-asc",
          rowNoun: "noun",
        }}
        emptyState={{ title: "No nouns match the current filters." }}
        toolbar={{
          search: false,
          leading: (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search noun / table…"
                aria-label="Search directive nouns and tables"
                className="h-11 w-full text-base sm:w-56 lg:h-8 lg:text-sm"
              />
              <Select value={familyFilter} onValueChange={setFamilyFilter}>
                <SelectTrigger
                  className="h-11 w-full text-base sm:w-56 lg:h-8 lg:text-sm"
                  aria-label="Filter directive nouns by family"
                >
                  <SelectValue placeholder="All families" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FAMILIES}>All families</SelectItem>
                  {families.map((family) => (
                    <SelectItem key={family} value={family}>
                      {family}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground lg:min-h-0">
                <Checkbox
                  checked={writableOnly}
                  onCheckedChange={(checked) =>
                    setWritableOnly(checked === true)
                  }
                  className="h-6 w-6 lg:h-4 lg:w-4"
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
          ),
        }}
        className="min-h-0 flex-1"
      />
      <CustomActionsSection
        catalog={catalog}
        query={query}
        onInspect={onInspect}
      />
    </div>
  );
}

function CustomActionsSection({
  catalog,
  query,
  onInspect,
}: {
  catalog: DirectiveCatalog;
  query: string;
  onInspect: (selection: DirectiveShapeSelection) => void;
}) {
  const customActions = catalog.actions ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? customActions.filter((entry) =>
        `${entry.name} ${entry.doc ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : customActions;
  if (visible.length === 0) return null;

  return (
    <section
      className="max-h-48 shrink-0 overflow-y-auto border-t border-border"
      aria-label="Custom actions"
    >
      <div className="bg-muted/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Custom Actions (Plane 2) &amp; legacy Directives
      </div>
      <ul className="divide-y divide-border/60">
        {visible.map((action) => (
          <li key={action.slug} className="grid grid-cols-[16rem_1fr]">
            <button
              type="button"
              className="min-h-11 px-3 py-2 text-left font-mono text-xs font-medium text-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() =>
                onInspect({ kind: "custom_action", customAction: action })
              }
              aria-label={`Inspect custom action ${action.name}`}
            >
              {action.name}
            </button>
            <span className="px-3 py-2 text-xs text-muted-foreground">
              {action.doc}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DirectiveStateCell({
  noun,
  verb,
  busy,
  onToggleWritable,
  onInspect,
}: {
  noun: NounDirectives;
  verb: DirectiveVerb;
  busy: boolean;
  onToggleWritable: (noun: NounDirectives, enabled: boolean) => void;
  onInspect: (selection: DirectiveShapeSelection) => void;
}) {
  const state = noun[verb];
  const writeVerb = verb === "create" || verb === "update" || verb === "delete";
  const canToggle = writeVerb && state !== "no";
  const enabled = noun.create === "yes" || noun.update === "yes";
  const schema = noun.schemas?.[verb];

  return (
    <StateCell
      state={state}
      busy={busy}
      onToggle={canToggle ? () => onToggleWritable(noun, !enabled) : undefined}
      toggleLabel={
        canToggle
          ? `${enabled ? "Disable" : "Enable"} generic write Directives for ${noun.noun}`
          : undefined
      }
      onInspect={
        schema ? () => onInspect({ kind: "directive", noun, verb }) : undefined
      }
      inspectLabel={`Inspect ${verb}:${noun.noun} shape`}
    />
  );
}
