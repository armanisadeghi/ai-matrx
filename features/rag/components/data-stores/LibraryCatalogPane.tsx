"use client";

/**
 * LibraryCatalogPane — teaser for the shared-knowledge library catalog on
 * the /rag home. Shows a handful of discoverable libraries with the caller's
 * entitlement chip and quick subscribe/unsubscribe; the full list-view
 * destination (search, detail, provenance, member table) is
 * `/rag/library-catalog` — this pane links there rather than growing.
 */

import Link from "next/link";
import { ArrowRight, Library, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { useLibraryCatalog } from "@/features/rag/hooks/useLibraryCatalog";
import { EntitlementChip } from "@/features/rag/components/library-catalog/EntitlementChip";

const TEASER_LIMIT = 4;

export function LibraryCatalogPane() {
  const { items, loading, error, subscribe, unsubscribe } = useLibraryCatalog();

  const onSubscribe = async (id: string, name: string) => {
    const ok = await subscribe(id);
    if (ok) toast.success(`Subscribed to ${name}`);
    else toast.error("Could not subscribe");
  };
  const onUnsubscribe = async (id: string, name: string) => {
    const ok = await unsubscribe(id);
    if (ok) toast.success(`Left ${name}`);
    else toast.error("Could not unsubscribe");
  };

  const shown = items.slice(0, TEASER_LIMIT);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Library className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Shared libraries</h2>
        <Link
          href="/rag/library-catalog"
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Browse the full catalog
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <p className="text-xs text-muted-foreground">
        Curated knowledge resources you can add to your workspace. Subscribed
        libraries are read-only — searchable alongside your own content.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="text-sm text-destructive">{error}</div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No shared libraries available yet.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shown.map((it) => (
              <div
                key={it.id}
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/rag/library-catalog?store_id=${it.id}`}
                      className="block truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {it.name}
                    </Link>
                    {it.description && (
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {it.description}
                      </div>
                    )}
                  </div>
                  <EntitlementChip
                    entitledVia={it.entitledVia}
                    industryName={it.entitledIndustryName}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {it.memberCount} document{it.memberCount === 1 ? "" : "s"}
                  </span>
                  {it.subscribed ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onUnsubscribe(it.id, it.name)}
                    >
                      <X className="h-3.5 w-3.5" /> Leave
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7"
                      onClick={() => onSubscribe(it.id, it.name)}
                    >
                      <Plus className="h-3.5 w-3.5" /> Subscribe
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {items.length > TEASER_LIMIT && (
            <Link
              href="/rag/library-catalog"
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              +{items.length - TEASER_LIMIT} more in the catalog
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </>
      )}
    </div>
  );
}
