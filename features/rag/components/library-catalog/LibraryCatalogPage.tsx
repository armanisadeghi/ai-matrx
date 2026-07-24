"use client";

/**
 * /rag/library-catalog — the shared-knowledge library catalog, as a real
 * list-view destination (list → open → act), per feature-entry doctrine.
 *
 * Left: every DISCOVERABLE shared library (rag.fn_list_library_catalog),
 * searchable + filterable, each row carrying the caller's true entitlement
 * chip (Subscribed / via <industry> / Available to everyone / Not entitled).
 * Right: the selected store — description, provenance ("why you have
 * access"), subscribe/unsubscribe, and a read-only member table with
 * preview links (visible only when the caller is entitled; RLS + the
 * fn_get_user_data_store gate enforce that server-side).
 *
 * Selection lives in ?store_id so deep links and refreshes work — same
 * pattern as /rag/data-stores.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  Check,
  ExternalLink,
  FileText,
  Library,
  Loader2,
  Lock,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import {
  useLibraryCatalog,
  type LibraryCatalogItem,
} from "@/features/rag/hooks/useLibraryCatalog";
import { useDataStoreDetail } from "@/features/rag/hooks/useDataStores";
import { useStoreProvenance } from "@/features/rag/hooks/useLibraryProvenance";
import {
  EntitlementChip,
  entitlementLabel,
} from "@/features/rag/components/library-catalog/EntitlementChip";

export function LibraryCatalogPage() {
  const router = useRouter();
  const search = useSearchParams();
  const storeId = search?.get("store_id") ?? null;

  const catalog = useLibraryCatalog();
  const [query, setQuery] = useState("");
  const [entitledOnly, setEntitledOnly] = useState(false);

  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(search?.toString() ?? "");
      if (id) params.set("store_id", id);
      else params.delete("store_id");
      const qs = params.toString();
      router.replace(`/rag/library-catalog${qs ? `?${qs}` : ""}`);
    },
    [router, search],
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.items.filter((it) => {
      if (entitledOnly && it.entitledVia == null) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q) ||
        (it.shortCode ?? "").toLowerCase().includes(q) ||
        (it.entitledIndustryName ?? "").toLowerCase().includes(q)
      );
    });
  }, [catalog.items, query, entitledOnly]);

  const selected = catalog.items.find((it) => it.id === storeId) ?? null;

  return (
    <>
      <RagHubHeader
        right={
          <span className="px-2 text-xs tabular-nums text-muted-foreground">
            {catalog.items.length}{" "}
            {catalog.items.length === 1 ? "library" : "libraries"}
          </span>
        }
      />
      <div className="flex h-full overflow-hidden bg-background">
        {/* Mobile: one pane at a time — list without a selection, detail with
            one (back arrow in the detail header returns to the list). */}
        <aside
          className={cn(
            "w-full shrink-0 flex-col overflow-hidden border-r pt-[var(--shell-header-h)] md:flex md:w-96",
            storeId ? "hidden" : "flex",
          )}
        >
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search libraries…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={entitledOnly}
                onChange={(e) => setEntitledOnly(e.target.checked)}
                className="h-3 w-3 accent-[var(--primary)]"
              />
              Only libraries I can read
            </label>
          </div>
          <div className="flex-1 overflow-auto">
            {catalog.loading && catalog.items.length === 0 && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            )}
            {catalog.error && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> {catalog.error}
              </div>
            )}
            {!catalog.loading && items.length === 0 && !catalog.error && (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                {catalog.items.length === 0
                  ? "No shared libraries are discoverable yet."
                  : "No libraries match your filters."}
              </div>
            )}
            {items.map((it) => (
              <CatalogListRow
                key={it.id}
                item={it}
                selected={it.id === storeId}
                onSelect={() => select(it.id)}
              />
            ))}
          </div>
        </aside>

        <section
          className={cn(
            "flex-1 overflow-hidden pt-[var(--shell-header-h)]",
            storeId ? "block" : "hidden md:block",
          )}
        >
          {!selected ? (
            <div className="m-6 max-w-2xl rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
              <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
                <Library className="h-4 w-4" /> Shared knowledge libraries
              </p>
              <p className="mb-2">
                Curated, read-only knowledge resources published by Matrx —
                for a whole industry, a specific organization, or everyone.
                The chip on each row tells you whether (and why) you can
                already read it.
              </p>
              <p>Pick a library on the left to see what&apos;s inside.</p>
            </div>
          ) : (
            <CatalogDetailPanel
              item={selected}
              onBack={() => select(null)}
              onSubscribe={async () => {
                const ok = await catalog.subscribe(selected.id);
                if (ok) toast.success(`Subscribed to ${selected.name}`);
                else toast.error(catalog.error ?? "Could not subscribe");
              }}
              onUnsubscribe={async () => {
                const ok = await catalog.unsubscribe(selected.id);
                if (ok) toast.success(`Left ${selected.name}`);
                else toast.error(catalog.error ?? "Could not unsubscribe");
              }}
            />
          )}
        </section>
      </div>
    </>
  );
}

function CatalogListRow({
  item,
  selected,
  onSelect,
}: {
  item: LibraryCatalogItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full border-b border-border/50 px-3 py-2 text-left hover:bg-muted/40",
        selected && "bg-muted/60",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span className="flex-1 truncate text-xs font-medium">
          {item.name}
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {item.memberCount} doc{item.memberCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <EntitlementChip
          entitledVia={item.entitledVia}
          industryName={item.entitledIndustryName}
        />
        {item.shortCode ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            {item.shortCode}
          </span>
        ) : null}
      </div>
      {item.description && (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
          {item.description}
        </div>
      )}
    </button>
  );
}

function CatalogDetailPanel({
  item,
  onBack,
  onSubscribe,
  onUnsubscribe,
}: {
  item: LibraryCatalogItem;
  /** Mobile: return to the list pane. */
  onBack: () => void;
  onSubscribe: () => Promise<void>;
  onUnsubscribe: () => Promise<void>;
}) {
  const entitled = item.entitledVia != null;
  // Members are visible only to entitled callers (grant-reader RLS); skip the
  // fetch entirely when the chip already says "Not entitled" so the panel
  // shows the subscribe prompt instead of a server error.
  const detail = useDataStoreDetail(entitled ? item.id : null);
  const { entries: provenance } = useStoreProvenance(item.id);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 space-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the catalog list"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Library className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">{item.name}</h1>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
            {item.kind}
          </span>
          <EntitlementChip
            entitledVia={item.entitledVia}
            industryName={item.entitledIndustryName}
          />
          <div className="ml-auto flex items-center gap-1">
            {item.subscribed ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-muted-foreground hover:text-destructive"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  await onUnsubscribe();
                  setPending(false);
                }}
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <X className="h-3.5 w-3.5" />
                )}
                Leave
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={pending}
                onClick={async () => {
                  setPending(true);
                  await onSubscribe();
                  setPending(false);
                }}
              >
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Subscribe
              </Button>
            )}
          </div>
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground">{item.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {item.memberCount} document{item.memberCount === 1 ? "" : "s"}
          </span>
          {item.shortCode ? (
            <span className="font-mono">{item.shortCode}</span>
          ) : null}
          <span className="select-all font-mono text-[10px]">{item.id}</span>
        </div>
        {/* Why you have access — every grant reaching the caller. */}
        {provenance.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3 text-primary" />
            <span className="font-medium text-foreground/80">
              Why you have access:
            </span>
            {provenance.map((p, i) => (
              <span
                key={`${p.audience}-${p.industryId ?? p.organizationId ?? i}`}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-primary"
              >
                {p.audience === "industry"
                  ? `Your organization belongs to ${p.industryName ?? "an industry"}`
                  : p.audience === "organization"
                    ? "Your organization subscribed"
                    : "Published to everyone"}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {!entitled ? (
          <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
            <Lock className="mx-auto mb-2 h-6 w-6 text-muted-foreground/60" />
            <p className="mb-1 font-medium text-foreground/80">
              {entitlementLabel(item.entitledVia, item.entitledIndustryName)}
            </p>
            <p>
              Your organization has no grant for this library yet. Subscribe
              above, or join the publishing industry in your organization
              settings, to read its {item.memberCount} document
              {item.memberCount === 1 ? "" : "s"}.
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Documents ({detail.members.length})
            </h2>
            {detail.loading && detail.members.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </div>
            ) : detail.error ? (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" /> {detail.error}
              </div>
            ) : detail.members.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                This library has no documents yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full whitespace-nowrap text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Document
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Kind
                      </th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Added
                      </th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {detail.members.map((m) => (
                      <tr
                        key={`${m.sourceKind}/${m.sourceId}`}
                        className="hover:bg-muted/20"
                      >
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5 text-xs">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            {m.label ?? "Untitled document"}
                          </div>
                          <div className="select-all truncate font-mono text-[10px] text-muted-foreground">
                            {m.sourceId}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {m.sourceKind}
                        </td>
                        <td className="px-3 py-1.5 text-[10px] tabular-nums text-muted-foreground">
                          {new Date(m.addedAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {m.sourceKind === "cld_file" ? (
                            <a
                              href={`/files/f/${m.sourceId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                            >
                              <BookOpenText className="h-3.5 w-3.5" /> Preview
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground/70">
              Shared libraries are read-only — searchable alongside your own
              content, but only Matrx curators can change what&apos;s inside.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
