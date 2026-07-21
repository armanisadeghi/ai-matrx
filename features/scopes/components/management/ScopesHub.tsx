// features/scopes/components/management/ScopesHub.tsx
//
// The /scopes landing page — scopes are the SUBJECT. One compact group per
// scope type (masonry columns, so the page fills), each group a vertical
// list of scope rows with the type's color as a thin connector accent —
// the same visual language as the org-overview tree. Chrome (org names,
// manage links) stays tiny and quiet. Reads exclusively through
// `useScopeTree`; never writes global context (Surface A invariant —
// rows navigate, they don't activate).

"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
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

  // Active org's dimensions first, then personal, then alphabetical by org;
  // within an org, the type's own sort_order.
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

  return (
    <div className="space-y-4">
      <HeavyHitterSuggestionsInbox />

      <div className="flex flex-wrap items-center gap-3">
        <div className="text-sm text-muted-foreground">
          <span className="text-foreground font-medium">{totalScopes}</span>{" "}
          scope{totalScopes === 1 ? "" : "s"} in{" "}
          <span className="text-foreground font-medium">
            {dimensions.length}
          </span>{" "}
          dimension{dimensions.length === 1 ? "" : "s"}
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
        <div className="columns-1 md:columns-2 xl:columns-3 gap-4 [column-fill:balance]">
          {visible.map(({ org, type }) => (
            <TypeGroup
              key={type.id}
              org={org}
              type={type}
              activeScopeIds={activeScopeIds}
              showOrg={showOrg}
            />
          ))}
        </div>
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
    </div>
  );
}

function TypeGroup({
  org,
  type,
  activeScopeIds,
  showOrg,
}: {
  org: OrgNode;
  type: ScopeTypeNode;
  activeScopeIds: Set<string>;
  showOrg: boolean;
}) {
  const manageHref = `/organizations/${org.slug ?? org.id}/scopes/${type.id}`;
  return (
    <section className="break-inside-avoid mb-4 rounded-lg border border-border bg-card">
      {/* Group header — small, identity only */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
        <span style={{ color: type.color }}>
          <DynamicIcon name={type.icon} className="h-4 w-4" />
        </span>
        <span className="text-[13px] font-semibold tracking-wide">
          {type.label_plural}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {type.scopes.length}
        </span>
        {showOrg && (
          <span className="text-[10px] text-muted-foreground/70 truncate ml-1">
            {org.name}
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5 shrink-0">
          <Link
            href={manageHref}
            title={`Manage ${type.label_plural}`}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={manageHref}
            title={`New ${type.label_singular}`}
            className="p-1 rounded text-muted-foreground/60 hover:text-foreground hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" />
          </Link>
        </span>
      </div>

      {/* Scope rows — THE content. Vertical, prominent, connector-accented. */}
      {type.scopes.length === 0 ? (
        <div className="px-3 pb-3 text-xs text-muted-foreground italic">
          None yet.
        </div>
      ) : (
        <ul
          className="pb-1.5 ml-[1.15rem] mr-1.5 border-l pl-0"
          style={{
            borderColor: `color-mix(in srgb, ${type.color} 45%, transparent)`,
          }}
        >
          {type.scopes.map((scope) => {
            const isActive = activeScopeIds.has(scope.id);
            return (
              <li key={scope.id}>
                <Link
                  href={`/scopes/${scope.id}`}
                  className={cn(
                    "group flex items-center gap-2 pl-3 pr-2 py-[7px] rounded-r-md hover:bg-accent/70 transition-colors",
                    isActive && "bg-primary/5",
                  )}
                >
                  <span
                    className="h-[7px] w-[7px] rounded-full shrink-0"
                    style={{
                      backgroundColor: isActive ? type.color : undefined,
                      border: isActive
                        ? undefined
                        : `1.5px solid color-mix(in srgb, ${type.color} 60%, transparent)`,
                    }}
                  />
                  <span
                    className={cn(
                      "text-[15px] leading-tight truncate",
                      isActive ? "font-semibold" : "font-medium",
                    )}
                  >
                    {scope.name}
                  </span>
                  {isActive && (
                    <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                      active
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function HubSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-64 bg-muted animate-pulse rounded" />
      <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
        {[4, 6, 3, 5, 4, 3].map((rows, i) => (
          <Card key={i} className="break-inside-avoid mb-4 p-3 space-y-2.5">
            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
            {Array.from({ length: rows }, (_, j) => (
              <div key={j} className="h-4 w-4/5 bg-muted animate-pulse rounded ml-4" />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ScopesHub;
