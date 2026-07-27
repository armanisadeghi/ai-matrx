// features/scopes/components/management/ScopesHub.tsx
//
// The /scopes landing page — one full-width TABLE per scope type. Rows are
// the scopes; columns are the type's context items (capped at
// MAX_ITEM_COLUMNS, sorted by sort_order) with each scope's current cell
// value summarized via the canonical `summarizeContextCell`. Row click →
// the CANONICAL org-scoped scope page (/organizations/{org}/scopes/{type}/{scope}
// — the legacy /scopes/{id} detail route is deleted); the type header links
// to the scope-type page. Data:
// tree via `useScopeTree`, columns/cells batch-loaded via
// `useScopeTypeTables` (two round-trips total). Never writes global
// context (Surface A invariant — everything here navigates).

"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building,
  ExternalLink,
  Plus,
  Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import { useScopeTypeTables } from "@/features/scopes/hooks/useScopeTypeTables";
import { summarizeContextCell } from "@/features/scopes/utils/referenceCell";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { HeavyHitterSuggestionsInbox } from "@/features/kg-suggestions/components/HeavyHitterSuggestionsInbox";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  createScopesScope,
  SCOPES_SURFACE_NAME,
  type ScopesContextItemEntry,
} from "@/features/surfaces/manifests/scopes.manifest";
import {
  buildScopesDirectoryValues,
  currentSelection,
} from "@/features/scopes/lib/scopes-surface-scope";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTreeFetchedAt } from "@/features/scopes/redux/selectors/tree";
import { cn } from "@/utils/cn";
import type {
  ContextItemRow,
  ContextItemValue,
  OrgNode,
  ScopeTypeNode,
} from "@/features/scopes/types";

/** Reasonable cap on context-item columns so wide catalogs don't explode
 *  the table; overflow is announced in the header ("+N more"). */
const MAX_ITEM_COLUMNS = 6;

interface DimensionRow {
  org: OrgNode;
  type: ScopeTypeNode;
}

export function ScopesHub() {
  const { organizations, status, error, refresh } = useScopeTree();
  const active = useActiveContext();
  const [query, setQuery] = useState("");

  // Active org first, then personal, then alphabetical; types by sort_order.
  const orderedOrgs = [...organizations].sort((a, b) => {
    if (a.id === active.organizationId) return -1;
    if (b.id === active.organizationId) return 1;
    if (a.is_personal !== b.is_personal) return a.is_personal ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const dimensions: DimensionRow[] = orderedOrgs.flatMap((org) =>
    [...org.scope_types]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((type) => ({ org, type })),
  );

  const tables = useScopeTypeTables(
    dimensions.map((d) => d.type.id),
    dimensions.flatMap((d) => d.type.scopes.map((s) => s.id)),
  );

  // ── Surface emitter (`matrx-user/scopes`, view "hub") ──────────────────
  // Built at Run time from live render values; `wrap` keeps every early-return
  // branch inside the provider so the surface emits during load and error too.
  const treeFetchedAt = useAppSelector(selectTreeFetchedAt);
  const getScope = () => {
    const items: ScopesContextItemEntry[] = [];
    for (const list of Object.values(tables.itemsByType)) {
      for (const item of list) {
        items.push({
          id: item.id,
          scope_type_id: item.scope_type_id,
          key: item.key,
          display_name: item.display_name,
          description: item.description,
          value_type: item.value_type,
          sort_order: item.sort_order,
        });
      }
    }
    const itemKeyById = new Map(items.map((i) => [i.id, i.key]));
    const cells: Record<string, Record<string, string>> = {};
    for (const [scopeId, byItem] of Object.entries(tables.valuesByScope)) {
      const row: Record<string, string> = {};
      for (const [itemId, cell] of Object.entries(byItem)) {
        const summary = summarizeContextCell(cell);
        if (summary) row[itemKeyById.get(itemId) ?? itemId] = summary;
      }
      cells[scopeId] = row;
    }
    const catalogReady = tables.status === "ready";
    return createScopesScope({
      current_view: "hub",
      ...buildScopesDirectoryValues(organizations, active),
      ...(catalogReady
        ? {
            context_item_count: items.length,
            context_items_summary: items,
            scope_context_values: cells,
          }
        : {}),
      context_catalog_status: tables.status,
      ...(query.trim() ? { search_query: query.trim() } : {}),
      tree_status: status,
      ...(treeFetchedAt ? { tree_fetched_at: String(treeFetchedAt) } : {}),
      ...(error ? { tree_error: error } : {}),
      selection: currentSelection(),
    });
  };
  const wrap = (body: ReactNode) => (
    <SurfaceRuntimeProvider
      surfaceName={SCOPES_SURFACE_NAME}
      getScope={getScope}
      isEditable={false}
    >
      {body}
    </SurfaceRuntimeProvider>
  );

  if (status === "loading" && organizations.length === 0) {
    return wrap(<HubSkeleton />);
  }

  if (status === "error") {
    return wrap(
      <Card className="p-6 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-2">
          <div className="font-medium">Couldn&apos;t load your scopes</div>
          <div className="text-sm text-muted-foreground">
            {error ?? "Unknown error"}
          </div>
          <button
            onClick={() => void refresh()}
            className="text-xs text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </Card>,
    );
  }

  if (organizations.length === 0) {
    return wrap(
      <Card className="p-8 text-center">
        <Building className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <div className="font-medium">No organizations yet</div>
        <p className="text-sm text-muted-foreground mt-1">
          Create an organization to start defining scopes for your work.
        </p>
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 mt-4 text-xs text-primary hover:underline"
        >
          Go to Organizations
        </Link>
      </Card>,
    );
  }

  const emptyOrgs = orderedOrgs.filter((o) => o.scope_types.length === 0);
  const q = query.trim().toLowerCase();
  const visible = q
    ? dimensions
        .map(({ org, type }) => ({
          org,
          type: {
            ...type,
            scopes: type.label_plural.toLowerCase().includes(q)
              ? type.scopes
              : type.scopes.filter((s) => s.name.toLowerCase().includes(q)),
          },
        }))
        .filter(({ type }) => type.scopes.length > 0)
    : dimensions;

  const totalScopes = dimensions.reduce((n, d) => n + d.type.scopes.length, 0);
  const activeScopeIds = new Set(active.scopeIds);
  const showOrg = organizations.length > 1;

  return wrap(
    <div className="space-y-5">
      <HeavyHitterSuggestionsInbox />

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">{totalScopes}</span>{" "}
          scope{totalScopes === 1 ? "" : "s"} in{" "}
          <span className="text-foreground font-medium">
            {dimensions.length}
          </span>{" "}
          scope type{dimensions.length === 1 ? "" : "s"}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter scopes…"
            className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-card text-base sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No scopes match &ldquo;{query}&rdquo;.
        </div>
      ) : (
        visible.map(({ org, type }) => (
          <ScopeTypeTable
            key={type.id}
            org={org}
            type={type}
            items={tables.itemsByType[type.id] ?? []}
            valuesByScope={tables.valuesByScope}
            cellsStatus={tables.status}
            activeScopeIds={activeScopeIds}
            showOrg={showOrg}
          />
        ))
      )}

      {emptyOrgs.length > 0 && !q && (
        <div className="pt-1 space-y-1.5">
          {emptyOrgs.map((org) => (
            <div
              key={org.id}
              className="flex items-center gap-2 rounded-md border border-dashed border-border/60 px-3 py-2 text-xs text-muted-foreground"
            >
              <Building className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                <span className="text-foreground/80">{org.name}</span> has no
                scopes yet
              </span>
              <Link
                href={`/organizations/${org.slug ?? org.id}/scopes`}
                className="ml-auto inline-flex items-center gap-1 text-primary hover:underline shrink-0"
              >
                <Plus className="h-3 w-3" />
                Define scopes
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>,
  );
}

function ScopeTypeTable({
  org,
  type,
  items,
  valuesByScope,
  cellsStatus,
  activeScopeIds,
  showOrg,
}: {
  org: OrgNode;
  type: ScopeTypeNode;
  items: ContextItemRow[];
  valuesByScope: Record<string, Record<string, ContextItemValue>>;
  cellsStatus: "idle" | "loading" | "ready" | "error";
  activeScopeIds: Set<string>;
  showOrg: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const typeHref = `/organizations/${org.slug ?? org.id}/scopes/${type.id}`;

  const columns = items.slice(0, MAX_ITEM_COLUMNS);
  const hiddenCount = items.length - columns.length;

  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 border-b border-border/60">
        <span style={{ color: type.color }}>
          <DynamicIcon name={type.icon} className="h-4 w-4" />
        </span>
        <Link
          href={typeHref}
          className="text-sm font-semibold hover:underline underline-offset-2"
        >
          {type.label_plural}
        </Link>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {type.scopes.length}
        </span>
        {showOrg && (
          <span className="text-[11px] text-muted-foreground/70 truncate">
            · {org.name}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {hiddenCount > 0 && (
            <span className="hidden sm:inline text-[10px] text-muted-foreground mr-1">
              +{hiddenCount} more column{hiddenCount === 1 ? "" : "s"} on the
              type page
            </span>
          )}
          <Link
            href={typeHref}
            title={`Open ${type.label_plural} page`}
            className="p-1 rounded text-muted-foreground/70 hover:text-foreground hover:bg-accent"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={typeHref}
            title={`New ${type.label_singular}`}
            className="p-1 rounded text-muted-foreground/70 hover:text-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </span>
      </div>

      {type.scopes.length === 0 ? (
        <div className="px-4 py-3 text-xs text-muted-foreground italic">
          No {type.label_plural.toLowerCase()} yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            className={cn(
              "w-full text-sm border-collapse",
              isPending && "opacity-60 pointer-events-none",
            )}
          >
            <thead>
              <tr className="border-b border-border/50 text-left">
                <th className="px-3 sm:px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/75 whitespace-nowrap">
                  {type.label_singular}
                </th>
                {columns.map((item) => (
                  <th
                    key={item.id}
                    className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/75 whitespace-nowrap max-w-[16rem] truncate"
                    title={item.description || item.display_name}
                  >
                    {item.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {type.scopes.map((scope) => {
                const isActive = activeScopeIds.has(scope.id);
                const cells = valuesByScope[scope.id];
                return (
                  <tr
                    key={scope.id}
                    onClick={() =>
                      startTransition(() =>
                        router.push(`${typeHref}/${scope.id}`),
                      )
                    }
                    className={cn(
                      "border-b border-border/30 last:border-b-0 cursor-pointer transition-colors hover:bg-accent/60",
                      isActive && "bg-primary/5",
                    )}
                    style={
                      isActive
                        ? { boxShadow: `inset 2px 0 0 ${type.color}` }
                        : undefined
                    }
                  >
                    <td className="px-3 sm:px-4 py-2 whitespace-nowrap">
                      <span
                        className={cn(
                          "font-medium",
                          isActive && "font-semibold",
                        )}
                      >
                        {scope.name}
                      </span>
                    </td>
                    {columns.map((item) => {
                      const cell = cells?.[item.id];
                      const summary = cell ? summarizeContextCell(cell) : null;
                      return (
                        <td
                          key={item.id}
                          className="px-3 py-2 max-w-[18rem]"
                          title={summary ?? undefined}
                        >
                          {summary ? (
                            <span className="block truncate text-foreground/90">
                              {summary}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">
                              {cellsStatus === "loading" ? "…" : "—"}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function HubSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-64 bg-muted animate-pulse rounded" />
      {[4, 3, 5].map((rows, i) => (
        <Card key={i} className="p-0 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/50">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
          <div className="divide-y divide-border/30">
            {Array.from({ length: rows }, (_, j) => (
              <div key={j} className="px-4 py-2.5 flex gap-6">
                <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default ScopesHub;
