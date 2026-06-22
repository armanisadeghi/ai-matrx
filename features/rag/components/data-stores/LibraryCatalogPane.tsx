"use client";

/**
 * LibraryCatalogPane — browse DISCOVERABLE shared knowledge libraries and
 * self-subscribe (Shared Knowledge Resources, opt-in tier). A subscribed
 * library appears in the tenant's data-store list (read-only) and is searchable.
 */

import { Check, Library, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLibraryCatalog } from "@/features/rag/hooks/useLibraryCatalog";

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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Library className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Shared libraries</h2>
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {it.name}
                  </div>
                  {it.description && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {it.description}
                    </div>
                  )}
                </div>
                {it.subscribed && (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                    <Check className="h-3 w-3" /> Subscribed
                  </span>
                )}
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
      )}
    </div>
  );
}
