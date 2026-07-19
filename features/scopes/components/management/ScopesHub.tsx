// features/scopes/components/management/ScopesHub.tsx
//
// The /scopes landing page — scope-FIRST, not org-first. Renders one
// "dimension band" per scope type (aggregated across every org the user
// belongs to), each holding its scope tiles. Orgs appear only as quiet
// metadata; orgs with no dimensions collapse into a footer row. Reads
// exclusively through `useScopeTree`; never writes global context
// (Surface A invariant — tiles navigate, they don't activate).

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Building,
  ChevronRight,
  FolderKanban,
  Layers,
  Plus,
  Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { HeavyHitterSuggestionsInbox } from "@/features/kg-suggestions/components/HeavyHitterSuggestionsInbox";
import { cn } from "@/utils/cn";
import type { OrgNode, ScopeTypeNode } from "@/features/scopes/types";

interface DimensionRow {
  org: OrgNode;
  type: ScopeTypeNode;
}

export function ScopesHub() {
  const { organizations, status, error, refresh } = useScopeTree();
  const active = useActiveContext();
  const [query, setQuery] = useState("");

  if (status === "loading" && organizations.length === 0) {
    return <HubSkeleton />;
  }

  if (status === "error") {
    return (
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
      </Card>
    );
  }

  if (organizations.length === 0) {
    return (
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
      </Card>
    );
  }

  // Flatten to dimensions, active org's dimensions first, then personal,
  // then alphabetical by org; within an org, the type's own sort_order.
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
  const emptyOrgs = orderedOrgs.filter((o) => o.scope_types.length === 0);

  const q = query.trim().toLowerCase();
  const visible = q
    ? dimensions
        .map(({ org, type }) => ({
          org,
          type: {
            ...type,
            scopes: type.scopes.filter(
              (s) =>
                s.name.toLowerCase().includes(q) ||
                s.description?.toLowerCase().includes(q) ||
                type.label_plural.toLowerCase().includes(q),
            ),
          },
        }))
        .filter(
          ({ type }) =>
            type.scopes.length > 0 || type.label_plural.toLowerCase().includes(q),
        )
    : dimensions;

  const totalScopes = dimensions.reduce((n, d) => n + d.type.scopes.length, 0);
  const activeScopeIds = new Set(active.scopeIds);

  return (
    <div className="space-y-5">
      <HeavyHitterSuggestionsInbox />

      {/* Summary + search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="h-4 w-4" />
          <span>
            <span className="text-foreground font-medium">
              {dimensions.length}
            </span>{" "}
            dimension{dimensions.length === 1 ? "" : "s"} ·{" "}
            <span className="text-foreground font-medium">{totalScopes}</span>{" "}
            scope{totalScopes === 1 ? "" : "s"} across{" "}
            <span className="text-foreground font-medium">
              {organizations.length}
            </span>{" "}
            organization{organizations.length === 1 ? "" : "s"}
          </span>
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
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No scopes match &ldquo;{query}&rdquo;.
        </Card>
      ) : (
        visible.map(({ org, type }) => (
          <DimensionBand
            key={type.id}
            org={org}
            type={type}
            activeScopeIds={activeScopeIds}
            isActiveOrg={org.id === active.organizationId}
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
                dimensions yet
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
    </div>
  );
}

function DimensionBand({
  org,
  type,
  activeScopeIds,
  isActiveOrg,
}: {
  org: OrgNode;
  type: ScopeTypeNode;
  activeScopeIds: Set<string>;
  isActiveOrg: boolean;
}) {
  const manageHref = `/organizations/${org.slug ?? org.id}/scopes/${type.id}`;
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Band header — the dimension's identity */}
      <div
        className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 border-b border-border/50"
        style={{
          backgroundImage: `linear-gradient(to right, color-mix(in srgb, ${type.color} 8%, transparent), transparent 65%)`,
        }}
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
          style={{
            backgroundColor: `color-mix(in srgb, ${type.color} 14%, transparent)`,
            color: type.color,
          }}
        >
          <DynamicIcon name={type.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {type.label_plural}
            </span>
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 tabular-nums"
              style={{ borderColor: type.color, color: type.color }}
            >
              {type.scopes.length}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
            <Building className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{org.name}</span>
            {isActiveOrg && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 ml-1">
                Active org
              </Badge>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <Link
            href={manageHref}
            className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <FolderKanban className="h-3 w-3" />
            Manage
          </Link>
          <Link
            href={manageHref}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            New
          </Link>
        </div>
      </div>

      {/* Scope tiles */}
      {type.scopes.length === 0 ? (
        <div className="px-4 py-4 text-xs text-muted-foreground italic">
          No {type.label_plural.toLowerCase()} yet — add the first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/40">
          {type.scopes.map((scope) => {
            const isActive = activeScopeIds.has(scope.id);
            return (
              <Link
                key={scope.id}
                href={`/scopes/${scope.id}`}
                className={cn(
                  "group relative bg-card px-3.5 py-2.5 min-h-[3.25rem] flex items-center gap-2.5 transition-colors hover:bg-accent/60",
                  isActive && "bg-primary/5",
                )}
              >
                <span
                  className="h-6 w-1 rounded-full shrink-0"
                  style={{
                    backgroundColor: isActive
                      ? type.color
                      : `color-mix(in srgb, ${type.color} 35%, transparent)`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm truncate">{scope.name}</span>
                    {isActive && (
                      <span
                        className="h-1.5 w-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: type.color }}
                        title="In your active context"
                      />
                    )}
                  </div>
                  {scope.description && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {scope.description}
                    </div>
                  )}
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            );
          })}
        </div>
      )}

      {/* Band footer — org escape hatch, kept quiet */}
      <div className="px-3 sm:px-4 py-1.5 border-t border-border/40 flex justify-end">
        <Link
          href={`/organizations/${org.slug ?? org.id}`}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Org overview
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}

function HubSkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-8 w-72 bg-muted animate-pulse rounded" />
      {[1, 2, 3].map((i) => (
        <Card key={i} className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 flex items-center gap-2.5">
            <div className="h-7 w-7 bg-muted animate-pulse rounded-md" />
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border/40">
            {[1, 2, 3].map((j) => (
              <div key={j} className="bg-card px-3.5 py-3">
                <div className="h-4 w-28 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default ScopesHub;
