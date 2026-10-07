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
import { Input } from "@ai-matrx/design-system/controls";
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
import type { DirectiveShapeSelection } from "@/features/directive-catalog/canvas/directiveShapeKind";
import { nounLabel } from "@/features/directive-catalog/nounOptions";

const ALL_FAMILIES = "__all__";

function isWritable(noun: NounDirectives): boolean {
  return (
    noun.create === "yes" || noun.update === "yes" || noun.delete === "yes"
  );
}

/** Rows per page of the type table (the pager offers more). */
export const DIRECTIVE_CATALOG_PAGE_SIZE = 50;

export function DirectiveCatalogGrid({
  catalog,
  busyToggle,
  onToggleWritable,
  onInspect,
  onPickNoun,
}: {
  catalog: DirectiveCatalog;
  busyToggle: string | null;
  onToggleWritable: (noun: NounDirectives, enabled: boolean) => void;
  onInspect: (selection: DirectiveShapeSelection) => void;
  /** Load this noun into the build & test panel. */
  onPickNoun?: (noun: NounDirectives) => void;
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
        `${noun.noun} ${nounLabel(noun)} ${noun.table} ${noun.family}`
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
        width: 200,
        frozen: true,
        cell: (noun) => {
          const body = (
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-medium">{nounLabel(noun)}</span>
              <span className="truncate font-mono text-[11px] text-muted-foreground">
                {noun.noun}
              </span>
            </span>
          );
          return onPickNoun ? (
            <button
              type="button"
              onClick={() => onPickNoun(noun)}
              title="Try it in the builder"
              aria-label={`Try ${nounLabel(noun)} in the builder`}
              className="flex w-full min-w-0 rounded text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {body}
            </button>
          ) : (
            body
          );
        },
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
  }, [busyToggle, onInspect, onToggleWritable, onPickNoun]);

  return (
    // Phone: natural height inside the page's one scroll area, the table at a
    // definite height of its own. lg: fills its pane.
    <div className="flex flex-col lg:h-full lg:min-h-0">
      <MatrxDataTable<NounDirectives>
        data={filtered}
        columns={columns}
        getRowId={(noun) => noun.noun}
        defaultSort={{ id: "noun", direction: "asc" }}
        // PAGED, never "show all" (G10B review, 2026-10-02): all 1,089 types
        // put ~69,000 nodes on the page, so every dialog's scroll lock cost a
        // ~800 ms style pass and the first confirm opened late.
        pageSize={DIRECTIVE_CATALOG_PAGE_SIZE}
        // Keep the catalog-wide count that the old toolbar exposed, inside the
        // one canonical footer. Decision: table owner applying Arman's footer rule.
        paginationLabelFormat={(start, end, total) =>
          total === 0
            ? `0 matching · ${catalog.nouns.length} nouns`
            : total === catalog.nouns.length
            ? `${start}–${end} of ${total} nouns`
            : `${start}–${end} of ${total} matching · ${catalog.nouns.length} nouns`
        }
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
            <div className="flex w-full flex-wrap items-center gap-2">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, token or table…"
                aria-label="Search directive nouns and tables"
                className="w-full sm:w-56"
              />
              <Select value={familyFilter} onValueChange={setFamilyFilter}>
                <SelectTrigger
                  className="w-full sm:w-56"
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
              <div className="ml-auto flex items-center gap-2">
                <StateBadge state="yes" />
                <StateBadge state="planned" />
                <StateBadge state="no" />
              </div>
            </div>
          ),
        }}
        className="h-[70dvh] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink"
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
    // Phone: flows in the page's one scroll area (no nested scroller). lg: a
    // short scrolling strip under the table. These are the server's actions
    // that are not a type × verb cell (custom actions and older directives);
    // the label says that in plain words, never the internal plane name.
    <section
      className="shrink-0 border-t border-border lg:max-h-48 lg:overflow-y-auto"
      aria-label="Other actions"
      data-directive-other-actions=""
    >
      <h2 className="bg-muted/40 px-3 py-1 text-xs font-semibold text-muted-foreground">
        Other actions
      </h2>
      <ul className="divide-y divide-border/60">
        {visible.map((action) => (
          <li key={action.slug} className="grid grid-cols-1 sm:grid-cols-[16rem_1fr]">
            <button
              type="button"
              className="min-h-11 px-3 py-2 text-left font-mono text-xs font-medium text-foreground transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              onClick={() =>
                onInspect({ kind: "custom_action", customAction: action })
              }
              aria-label={`Inspect action ${action.name}`}
            >
              {action.name}
            </button>
            <span className="px-3 pb-2 text-xs text-muted-foreground sm:py-2">
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
