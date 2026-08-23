"use client";

/**
 * /knowledge/library-catalog — THE MATRX LIBRARY, whole.
 *
 * Until 2026-08-23 this page read `rag.fn_list_library_catalog` and therefore
 * listed data stores only, while industry starter packs — published through the
 * SAME `platform.entity_grants` spine — surfaced only inside a site's value
 * screens. An org that had been GIVEN a pack had nowhere to see it, so the
 * catalog quietly lied about what the Library holds (Library STATE.md § Known
 * gaps, item 3). It now reads the generic `public.library_catalog`, which
 * delegates to each type's own entitlement-filtered reader.
 *
 * Left: every Library resource the caller's org can see, searchable, filterable
 * by type, each row carrying its entitlement chip (Subscribed / via <industry>
 * / Available to everyone / Not entitled).
 * Right: the selected resource — and THE SUBSCRIBE LAW decides its verb:
 *   • data store  → SUBSCRIBE (reference): read it in place, here.
 *   • starter pack → USE ON A SITE (copy): pick a site, land on that site's
 *     pack review screen. The catalog never fakes a subscribe for a copy type.
 *
 * Selection lives in ?type=&id= so deep links and refreshes work. `?store_id=`
 * is still honoured — it is a published URL shape people have bookmarked.
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpenText,
  Boxes,
  Check,
  ExternalLink,
  FileText,
  Layers,
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
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { RagHubHeader } from "@/features/rag/components/shell/RagHubHeader";
import {
  itemNoun,
  LIBRARY_TYPE_LABEL,
  LIBRARY_TYPE_LABEL_PLURAL,
  useLibraryResources,
  type LibraryEntityType,
  type LibraryResource,
} from "@/features/rag/hooks/useLibraryResources";
import { useDataStoreDetail } from "@/features/rag/hooks/useDataStores";
import { useStoreProvenance } from "@/features/rag/hooks/useLibraryProvenance";
import { useMyCuratorships } from "@/features/rag/hooks/useMyCuratorships";
import {
  EntitlementChip,
  entitlementLabel,
} from "@/features/rag/components/library-catalog/EntitlementChip";
import { PackDetailPanel } from "@/features/rag/components/library-catalog/PackDetailPanel";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildRagLibraryContextData } from "@/features/rag/agent-context/buildRagLibraryContextData";
import {
  MOBILE_TABLE,
  MOBILE_TABLE_FROZEN_CELL,
  MOBILE_TABLE_FROZEN_HEAD,
} from "@/components/official/mobile-table/mobileTable";

/** Canonical `ui_surface.name` this page emits — the catalog half. */
const RAG_LIBRARY_SURFACE = "matrx-user/knowledge-library";

/** Filter chips, in display order. `all` first. */
const TYPE_FILTERS = [
  "all",
  "data_store",
  "seo_starter_pack",
] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

function isTypeFilter(v: string | null): v is TypeFilter {
  return v != null && (TYPE_FILTERS as readonly string[]).includes(v);
}

function TypeIcon({
  entityType,
  className,
}: {
  entityType: LibraryEntityType;
  className?: string;
}) {
  const Icon = entityType === "seo_starter_pack" ? Boxes : Library;
  return <Icon className={className} aria-hidden />;
}

export function LibraryCatalogPage() {
  const router = useRouter();
  const search = useSearchParams();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  // `store_id` is the pre-2026-08-23 shape: a data-store id, no type.
  const selectedId = search?.get("id") ?? search?.get("store_id") ?? null;
  const selectedType: LibraryEntityType =
    search?.get("type") === "seo_starter_pack" ? "seo_starter_pack" : "data_store";

  const catalog = useLibraryResources();
  // Curators author what this page hands out — give them the door, nobody else.
  const curatorships = useMyCuratorships();
  const isCurator = (curatorships.data?.length ?? 0) > 0;
  const [query, setQuery] = useState("");
  const [entitledOnly, setEntitledOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const select = useCallback(
    (resource: LibraryResource | null) => {
      const params = new URLSearchParams(search?.toString() ?? "");
      params.delete("store_id");
      if (resource) {
        params.set("id", resource.id);
        params.set("type", resource.entityType);
      } else {
        params.delete("id");
        params.delete("type");
      }
      const qs = params.toString();
      router.replace(`/knowledge/library-catalog${qs ? `?${qs}` : ""}`);
    },
    [router, search],
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.items.filter((it) => {
      if (typeFilter !== "all" && it.entityType !== typeFilter) return false;
      if (entitledOnly && it.entitledVia == null) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q) ||
        (it.slug ?? "").toLowerCase().includes(q) ||
        (it.entitledIndustryName ?? "").toLowerCase().includes(q) ||
        LIBRARY_TYPE_LABEL[it.entityType].toLowerCase().includes(q)
      );
    });
  }, [catalog.items, query, entitledOnly, typeFilter]);

  const selected =
    catalog.items.find(
      (it) => it.id === selectedId && it.entityType === selectedType,
    ) ??
    catalog.items.find((it) => it.id === selectedId) ??
    null;

  // Live surface scope for the header Agents chrome — the catalog half of
  // `matrx-user/knowledge-library`. Built at Run time, never on mount.
  const getScope = useCallback(
    () =>
      buildRagLibraryContextData({
        view: "catalog",
        catalogItems: catalog.items,
        catalogVisible: items,
        catalogQuery: query,
        catalogEntitledOnly: entitledOnly,
        catalogTypeFilter: typeFilter,
        catalogSelectedId: selected?.id ?? null,
        selectionText:
          typeof window !== "undefined"
            ? (window.getSelection()?.toString() ?? "")
            : "",
      }),
    [catalog.items, items, query, entitledOnly, typeFilter, selected],
  );

  // ── Surface write handlers ──────────────────────────────────────────────
  //
  // ONE target on this half of the surface: `catalog_filters`, carrying the
  // search box, the entitled-only checkbox and the type chips as a single
  // object, landing through the same setters those controls use. All three are
  // React state setters — stable for the component's life — so there is no
  // stale-closure hazard across the confirm dialog.
  //
  // Subscribing / using a resource is deliberately NOT writable: it changes
  // what the organization HAS, which is theirs to decide, not a view decision.
  const buildWriteHandlers = () => ({
    catalog_filters: (value: unknown) => {
      let raw = value;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          throw new Error(
            "catalog_filters expects an object of filter keys, e.g. " +
              '{"search_query": "legal", "entitled_only": true} — received a string that is not valid JSON.',
          );
        }
      }
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new Error(
          `catalog_filters expects an object of filter keys — received ${Array.isArray(raw) ? "an array" : typeof raw}.`,
        );
      }
      const input = raw as Record<string, unknown>;

      const validKeys = ["search_query", "entitled_only", "type_filter"];
      const badKeys = Object.keys(input).filter((k) => !validKeys.includes(k));
      if (badKeys.length > 0) {
        throw new Error(
          `catalog_filters received unknown key(s): ${badKeys.join(", ")}. Nothing was changed. ` +
            `Valid keys are: ${validKeys.join(", ")}. This target only shapes the VIEW — it cannot ` +
            `give the organization a resource, take one away, or change what it is entitled to.`,
        );
      }
      if (Object.keys(input).length === 0) {
        throw new Error(
          `catalog_filters needs at least one of: ${validKeys.join(", ")}. An empty object would change nothing.`,
        );
      }

      // Validate the whole object before touching any control.
      let nextQuery: string | null = null;
      let nextEntitledOnly: boolean | null = null;
      let nextTypeFilter: TypeFilter | null = null;

      if ("search_query" in input) {
        if (typeof input.search_query !== "string") {
          throw new Error(
            `catalog_filters.search_query expects a plain string (pass "" to clear the search) — received ${typeof input.search_query}.`,
          );
        }
        nextQuery = input.search_query;
      }
      if ("entitled_only" in input) {
        const candidate = input.entitled_only;
        // The exact "true"/"false" strings are tolerated because the inline-tool
        // layer's parsing makes double-encoding a common model correction;
        // anything else throws rather than being guessed at for truthiness.
        if (candidate === true || candidate === "true") nextEntitledOnly = true;
        else if (candidate === false || candidate === "false")
          nextEntitledOnly = false;
        else
          throw new Error(
            `catalog_filters.entitled_only expects a boolean (true or false) — received ${JSON.stringify(candidate)}.`,
          );
      }
      if ("type_filter" in input) {
        const candidate = input.type_filter;
        if (typeof candidate !== "string" || !isTypeFilter(candidate)) {
          throw new Error(
            `catalog_filters.type_filter expects one of: ${TYPE_FILTERS.join(", ")} — received ${JSON.stringify(candidate)}.`,
          );
        }
        nextTypeFilter = candidate;
      }

      if (nextQuery !== null) setQuery(nextQuery);
      if (nextEntitledOnly !== null) setEntitledOnly(nextEntitledOnly);
      if (nextTypeFilter !== null) setTypeFilter(nextTypeFilter);
    },
  });

  const total = catalog.items.length;

  return (
    <SurfaceRuntimeProvider
      surfaceName={RAG_LIBRARY_SURFACE}
      getScope={getScope}
      getWriteHandlers={buildWriteHandlers}
      isEditable={false}
    >
      <RagHubHeader
        right={
          <div className="flex items-center gap-1">
            <span className="px-2 text-xs tabular-nums text-muted-foreground">
              {total} {total === 1 ? "resource" : "resources"}
            </span>
            {/* The curator's door, shown only to people who hold the role — a nav item
                everyone sees would lead almost everyone to an empty state. Same cached
                read the door itself uses. */}
            {isCurator ? (
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                <Link href="/knowledge/library-curate">
                  <Layers className="mr-1 size-3.5" /> Curate
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="flex h-full overflow-hidden bg-background">
        {/* Mobile: one pane at a time — list without a selection, detail with
            one (back arrow in the detail header returns to the list). */}
        <aside
          className={cn(
            "w-full shrink-0 flex-col overflow-hidden border-r pt-[var(--shell-header-h)] md:flex md:w-96",
            selected ? "hidden" : "flex",
          )}
        >
          <div className="space-y-2 border-b p-3">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the Library…"
                className="h-8 pl-7 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {TYPE_FILTERS.map((t) => {
                const count =
                  t === "all" ? catalog.items.length : catalog.countsByType[t];
                const label =
                  t === "all" ? "Everything" : LIBRARY_TYPE_LABEL_PLURAL[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                      typeFilter === t
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {label}
                    <span className="tabular-nums opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={entitledOnly}
                onChange={(e) => setEntitledOnly(e.target.checked)}
                className="h-3 w-3 accent-[var(--primary)]"
              />
              Only what my organization has
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
                  ? "Nothing in the Matrx Library reaches your organization yet."
                  : "Nothing matches your filters."}
              </div>
            )}
            {items.map((it) => (
              <CatalogListRow
                key={`${it.entityType}:${it.id}`}
                item={it}
                selected={it.id === selected?.id}
                onSelect={() => select(it)}
              />
            ))}
          </div>
        </aside>

        <section
          className={cn(
            "flex-1 overflow-hidden pt-[var(--shell-header-h)]",
            selected ? "block" : "hidden md:block",
          )}
        >
          {!selected ? (
            <EmptyPane counts={catalog.countsByType} />
          ) : selected.entityType === "seo_starter_pack" ? (
            <PackDetailPanel
              item={selected}
              onBack={() => select(null)}
              organizationId={organizationId ?? null}
            />
          ) : (
            <StoreDetailPanel
              item={selected}
              onBack={() => select(null)}
              onSubscribe={async () => {
                const ok = await catalog.subscribe(selected);
                if (ok) toast.success(`Subscribed to ${selected.name}`);
                else toast.error(catalog.error ?? "Could not subscribe");
              }}
              onUnsubscribe={async () => {
                const ok = await catalog.unsubscribe(selected);
                if (ok) toast.success(`Left ${selected.name}`);
                else toast.error(catalog.error ?? "Could not unsubscribe");
              }}
            />
          )}
        </section>
      </div>
    </SurfaceRuntimeProvider>
  );
}

/** The nothing-selected pane: what the Library is, and what each verb means. */
function EmptyPane({
  counts,
}: {
  counts: Record<LibraryEntityType, number>;
}) {
  return (
    <div className="m-6 max-w-2xl space-y-3 rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Library className="h-4 w-4" /> The Matrx Library
      </p>
      <p>
        Expertise curated for a whole industry, a specific organization, or
        everyone. The chip on each row tells you whether — and why — your
        organization already has it.
      </p>
      <ul className="space-y-1.5">
        <li className="flex items-start gap-2">
          <Library className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">
              {LIBRARY_TYPE_LABEL_PLURAL.data_store}
            </span>{" "}
            ({counts.data_store}) — you SUBSCRIBE. The documents stay in the
            Library and become searchable alongside your own content.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <Boxes className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">
              {LIBRARY_TYPE_LABEL_PLURAL.seo_starter_pack}
            </span>{" "}
            ({counts.seo_starter_pack}) — you USE ONE ON A SITE. Its defaults are
            copied onto the website you choose, and every row stays yours to
            edit.
          </span>
        </li>
      </ul>
      <p>Pick anything on the left to see what&apos;s inside.</p>
    </div>
  );
}

function CatalogListRow({
  item,
  selected,
  onSelect,
}: {
  item: LibraryResource;
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
        <TypeIcon
          entityType={item.entityType}
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        />
        <span className="flex-1 truncate text-xs font-medium">{item.name}</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {item.itemCount} {itemNoun(item.entityType, item.itemCount)}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <EntitlementChip
          entitledVia={item.entitledVia}
          industryName={item.entitledIndustryName}
        />
        <span className="truncate text-[10px] text-muted-foreground">
          {LIBRARY_TYPE_LABEL[item.entityType]}
        </span>
        {item.slug ? (
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            {item.slug}
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

/** A data store: subscribe conveys a REFERENCE, and the documents read here. */
function StoreDetailPanel({
  item,
  onBack,
  onSubscribe,
  onUnsubscribe,
}: {
  item: LibraryResource;
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
            aria-label="Back to the Library list"
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
            {item.itemCount} document{item.itemCount === 1 ? "" : "s"}
          </span>
          {item.slug ? <span className="font-mono">{item.slug}</span> : null}
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
              settings, to read its {item.itemCount} document
              {item.itemCount === 1 ? "" : "s"}.
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
                <table className={cn("whitespace-nowrap text-sm", MOBILE_TABLE)}>
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className={cn("px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground", MOBILE_TABLE_FROZEN_HEAD)}>
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
                        <td className={cn("px-3 py-1.5", MOBILE_TABLE_FROZEN_CELL)}>
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
