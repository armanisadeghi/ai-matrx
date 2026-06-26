"use client";

/**
 * OrgResourceList — generic card grid for an org's "shared with this org"
 * resources. Used by every Shared Resources tile on /organizations/[orgId].
 *
 * Each instance is configured by feature:
 *   - `resourceType` drives the permissions-table join (`note`, `agent`, etc.)
 *   - `ownedQuery` returns rows owned by the org directly (where the table
 *     has an `organization_id` column). Pass `null` if the resource table
 *     has no `organization_id` (e.g. `udt_datasets`).
 *   - `tableName` is the canonical Postgres table for hydrating shared rows.
 *   - `selectColumns` is the projection used by both queries.
 *   - `mapRow` turns a row into a `ResourceCardData` for rendering.
 *   - `getHref` builds the per-card destination URL.
 *
 * Rows that appear in both owned and shared queries are de-duped by id;
 * `source` reflects whichever query found them first ("owned" wins).
 */

import React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/utils/supabase/client";
import { listOrgSharedResources } from "@/utils/permissions/orgResources";
import { formatDistanceToNow } from "date-fns";
import {
  getShareableResource,
  type ResourceType,
} from "@/utils/permissions/registry";

export interface ResourceCardData {
  id: string;
  title: string;
  subtitle?: string | null;
  updatedAt?: string | null;
  tags?: string[];
  source: "owned" | "shared";
}

export interface OrgResourceListProps {
  orgId: string;
  resourceType: ResourceType;
  tableName: string;
  selectColumns: string;
  ownedQuery:
    | ((orgId: string) => Promise<Array<Record<string, unknown>>>)
    | null;
  mapRow: (
    row: Record<string, unknown>,
    source: "owned" | "shared",
  ) => ResourceCardData;
  getHref: (id: string) => string;
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon: React.ReactNode;
}

export function OrgResourceList({
  orgId,
  resourceType,
  tableName,
  selectColumns,
  ownedQuery,
  mapRow,
  getHref,
  emptyTitle,
  emptyDescription,
  emptyIcon,
}: OrgResourceListProps) {
  const router = useRouter();
  const [items, setItems] = React.useState<ResourceCardData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        const ownedRows = ownedQuery ? await ownedQuery(orgId) : [];
        const ownedIds = new Set(ownedRows.map((r) => String(r.id ?? "")));

        const sharedRefs = await listOrgSharedResources(orgId, resourceType);
        const sharedIds = sharedRefs
          .map((r) => r.resourceId)
          .filter((id) => !ownedIds.has(id));

        let sharedRows: Array<Record<string, unknown>> = [];
        if (sharedIds.length > 0) {
          // Hydrate shared rows from the canonical physical table. For most
          // resources `tableName` IS the physical table in `public`. But some
          // (files/folders, post-2026 canonicalization) live in a non-public
          // schema and carry a distinct `permissions.resource_type` key vs
          // their physical table name — resolve both from the registry so we
          // read `files.files` (not `public.file`). Falls back to the
          // `tableName` prop for any unregistered type.
          const entry = getShareableResource(resourceType);
          const physicalTable = entry?.physicalTable ?? tableName;
          const base = (
            entry?.schemaName ? supabase.schema(entry.schemaName as never) : supabase
          ) as ReturnType<typeof supabase.schema>;
          const res = await base
            .from(physicalTable as never)
            .select(selectColumns)
            .in("id", sharedIds);
          sharedRows =
            (res.data as unknown as Array<Record<string, unknown>>) ?? [];
        }

        if (cancelled) return;
        setItems([
          ...ownedRows.map((r) => mapRow(r, "owned")),
          ...sharedRows.map((r) => mapRow(r, "shared")),
        ]);
      } catch (err) {
        if (!cancelled) {
          console.error(`[OrgResourceList:${resourceType}] failed:`, err);
          setError("Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, resourceType, tableName, selectColumns, ownedQuery, mapRow]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 bg-muted">
          {emptyIcon}
        </div>
        <h2 className="text-xl font-semibold mb-2">{emptyTitle}</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {emptyDescription}
        </p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => router.push(getHref(item.id))}
          className="text-left p-4 rounded-lg border bg-card hover:bg-accent/50 hover:border-primary/30 transition-all cursor-pointer flex flex-col gap-2 min-h-[6rem]"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium line-clamp-2 flex-1">
              {item.title || "Untitled"}
            </h3>
            <Badge
              variant={item.source === "owned" ? "secondary" : "outline"}
              className="text-[10px] shrink-0"
            >
              {item.source === "owned" ? "Org" : "Shared"}
            </Badge>
          </div>
          {item.subtitle && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {item.subtitle}
            </p>
          )}
          {item.tags && item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.slice(0, 3).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px]">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          {item.updatedAt && (
            <div className="text-xs text-muted-foreground mt-auto">
              Updated{" "}
              {formatDistanceToNow(new Date(item.updatedAt), {
                addSuffix: true,
              })}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
