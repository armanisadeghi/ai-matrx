"use client";

/**
 * features/knowledge/hub/containerGroups/HubContainerGroupView.tsx — the hub's
 * main pane for `view=group:<token>`: every container of one type as a list
 * (KNOWLEDGE-HUB §6, H6b). It is the job the retired list pages did — Data
 * stores, Libraries, the Library catalog — and each row opens that container's
 * own RECORD page, which stays the best screen for working on it.
 *
 * Champion: Linear's project list — one list per container type, filters in the
 * address, a row opens the thing, nothing the old page offered is lost.
 *
 * Filters live in the URL as `g.*` (groupFilters.ts); every read has its own
 * loading / error / empty state, and a failed read never reads as "none".
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Boxes,
  Database,
  Layers,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  X,
} from "lucide-react";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrgBootstrapResolved, selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useDataStores } from "@/features/rag/hooks/useDataStores";
import {
  LIBRARY_TYPE_LABEL,
  LIBRARY_TYPE_LABEL_PLURAL,
  itemNoun,
  useLibraryResources,
  type LibraryEntityType,
} from "@/features/rag/hooks/useLibraryResources";
import { useMyCuratorships } from "@/features/rag/hooks/useMyCuratorships";
import { listLibraries } from "@/features/source-library/api";
import type { LibraryRow } from "@/features/source-library/types";
import { CatalogPasteBox } from "@/features/source-library/components/CatalogPasteBox";
import { hubHref, DEFAULT_HUB_STATE, type HubGroupToken } from "@/features/knowledge/hub/hubState";
import {
  ADAPTER_WORDS,
  CATALOG_TYPES,
  HUB_GROUP_LABEL,
  LIBRARY_LANES,
  LIBRARY_LANE_LABEL,
  NEW_DATA_STORE_HREF,
  catalogEntitledOnly,
  catalogRecordHref,
  catalogType,
  dataStoreRecordHref,
  filterCatalog,
  filterDataStores,
  groupWords,
  libraryAdapters,
  laneCountRequests,
  libraryLane,
  libraryListRequest,
  libraryRecordHref,
  rulebookHandoff,
  type LibraryLane,
} from "@/features/knowledge/hub/containerGroups/groupFilters";

type Group = Record<string, string>;

export interface HubContainerGroupViewProps {
  token: HubGroupToken;
  group: Group;
  /** Write the group's filters (replace while typing, push otherwise). */
  onGroupChange: (next: Group, opts?: { replace?: boolean }) => void;
}

export function HubContainerGroupView({ token, group, onGroupChange }: HubContainerGroupViewProps) {
  const set = (key: string, value: string | null, replace = false) => {
    const next = { ...group };
    if (value) next[key] = value;
    else delete next[key];
    onGroupChange(next, { replace });
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2" data-testid={`hub-group-${token}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={group.q ?? ""}
          onChange={(e) => set("q", e.target.value, true)}
          placeholder={`Filter ${HUB_GROUP_LABEL[token].toLowerCase()} by name…`}
          aria-label={`Filter ${HUB_GROUP_LABEL[token].toLowerCase()} by name`}
          className="h-9 pl-8"
        />
      </div>
      {token === "data_store" ? <DataStoresGroup group={group} /> : null}
      {token === "media_source_library" ? <LibrariesGroup group={group} set={set} /> : null}
      {token === "library_catalog" ? <CatalogGroup group={group} set={set} /> : null}
    </div>
  );
}

// ─── shared pieces ──────────────────────────────────────────────────────────

function Notice({ tone = "muted", children }: { tone?: "muted" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 px-2 py-3 text-sm",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {tone === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <span className="min-w-0 flex-1">
        {children}
      </span>
    </div>
  );
}

function RowLink({
  href,
  icon: Icon,
  title,
  meta,
  count,
  description,
  descriptionIsError = false,
  trailing,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  count?: string | null;
  description?: string | null;
  /** The description is the record's failure sentence (a failed sync): it carries the Alchemy Menu. */
  descriptionIsError?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="group flex min-w-0 items-start gap-2.5 rounded-md px-2 py-2 text-sm hover:bg-accent/60" role="listitem">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <Link href={href} className="min-w-0 flex-1 outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-foreground">{title}</span>
          {count ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{count}</span> : null}
        </div>
        {description && descriptionIsError ? (
          <div className="flex min-w-0 items-start gap-1 text-xs text-destructive">
            <span className="line-clamp-1 min-w-0">{description}</span>
            <ErrorAlchemyMenu error={description} size="xs" />
          </div>
        ) : description ? (
          <div className="line-clamp-1 text-xs text-muted-foreground">{description}</div>
        ) : null}
        <div className="truncate text-[11px] text-muted-foreground/90">{meta}</div>
      </Link>
      {trailing ? <div className="flex shrink-0 items-center gap-1">{trailing}</div> : null}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition-colors",
        active ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

// ─── Data stores ────────────────────────────────────────────────────────────

function DataStoresGroup({ group }: { group: Group }) {
  const list = useDataStores();
  // The read waits for the signed-in person; until then nothing is known — never "none yet".
  const userId = useAppSelector(selectUserId);
  const loading = list.loading || !userId;
  const rows = filterDataStores(list.stores, group);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {list.error ? "Could not count your data stores." : loading ? "Counting…" : plural(list.stores.length, "data store")}
        </span>
        <Button asChild size="sm" variant="outline" className="ml-auto h-8 gap-1.5">
          <Link href={NEW_DATA_STORE_HREF}>
            <Plus className="h-3.5 w-3.5" /> New data store
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Data stores">
        {loading && !list.stores.length ? <Notice>Reading your data stores…</Notice> : null}
        {list.error ? (
          <Notice tone="error">
            {list.error} — nothing is listed because the read failed, not because you have none.
            <ErrorAlchemyMenu error={list.error} size="xs" />{" "}
            <button type="button" className="underline underline-offset-2" onClick={list.refresh}>
              Retry
            </button>
          </Notice>
        ) : null}
        {!loading && !list.error && !list.stores.length ? (
          <Notice>No data stores yet. Create one with New data store; it opens ready for documents.</Notice>
        ) : null}
        {!list.error && list.stores.length > 0 && !rows.length ? (
          <Notice>No data store matches “{groupWords(group)}”.</Notice>
        ) : null}
        {rows.map((s) => (
          <RowLink
            key={s.id}
            href={dataStoreRecordHref(s.id)}
            icon={Database}
            title={s.name}
            count={plural(s.memberCount, "document")}
            description={s.description}
            meta={[s.kind ?? "general", s.shortCode, s.isActive ? null : "archived"].filter(Boolean).join(" · ")}
          />
        ))}
      </div>
    </>
  );
}

// ─── Libraries (a whole channel or feed, catalogued) ────────────────────────

const SYNC_WORDS: Record<LibraryRow["sync_status"], string> = {
  never_synced: "Not catalogued yet",
  syncing: "Cataloguing now",
  idle: "Catalogued",
  failed: "Last catalogue failed",
};

const PAGE = 50;

interface LibrariesRead {
  status: "loading" | "ready" | "error";
  rows: LibraryRow[];
  total: number;
  problems: string[];
  error: string | null;
}

function LibrariesGroup({ group, set }: { group: Group; set: (k: string, v: string | null, replace?: boolean) => void }) {
  const dispatch = useAppDispatch();
  const organizationId = useAppSelector(selectOrganizationId);
  const orgResolved = useAppSelector(selectOrgBootstrapResolved);
  const lane = libraryLane(group);
  const adapters = libraryAdapters(group);
  const words = groupWords(group);
  const handoff = rulebookHandoff(group);
  const [read, setRead] = useState<LibrariesRead>({ status: "loading", rows: [], total: 0, problems: [], error: null });
  const [laneCounts, setLaneCounts] = useState<Partial<Record<LibraryLane, number>>>({});
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const filterKey = `${organizationId ?? ""}|${lane}|${adapters.join(",")}|${words}|${attempt}`;

  useEffect(() => {
    // The transport refuses until the active organization resolves (one beat after first render).
    if (!organizationId) return;
    let cancelled = false;
    setRead((r) => ({ ...r, status: "loading", error: null }));
    listLibraries(dispatch, libraryListRequest(group, { limit: PAGE, offset: 0 }))
      .then((res) => {
        if (!cancelled)
          setRead({ status: "ready", rows: res.libraries, total: res.total, problems: res.row_problems ?? [], error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setRead({
            status: "error",
            rows: [],
            total: 0,
            problems: [],
            error: err instanceof Error ? err.message : "The Libraries could not be read.",
          });
      });
    // Each lane's number answers the question its tab would ask (same words and adapter).
    const lanes = laneCountRequests(group);
    void Promise.allSettled(lanes.map((l) => listLibraries(dispatch, l.request))).then((results) => {
      if (cancelled) return;
      const counts: Partial<Record<LibraryLane, number>> = {};
      results.forEach((r, i) => {
        // An unanswered lane stays "—" (unknown), never 0.
        if (r.status === "fulfilled") counts[lanes[i].lane] = r.value.total;
      });
      setLaneCounts(counts);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const loadMore = async () => {
    setMore({ loading: true, error: null });
    try {
      const res = await listLibraries(dispatch, libraryListRequest(group, { limit: PAGE, offset: read.rows.length }));
      setRead((r) => ({ ...r, rows: [...r.rows, ...res.libraries], problems: [...r.problems, ...(res.row_problems ?? [])] }));
      setMore({ loading: false, error: null });
    } catch (err) {
      setMore({ loading: false, error: err instanceof Error ? err.message : "The next page could not be read." });
    }
  };

  return (
    <>
      {handoff ? (
        <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <BookOpen className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 leading-relaxed">
              Paste the channel, feed, or address here first: we catalogue every Source in a Library, and from there you can
              send the ones you want to {handoff.backHref ? "the Rulebook you came from" : "a Rulebook"}.
            </p>
          </div>
          {handoff.backHref ? (
            <Link href={handoff.backHref} className="mt-1 inline-flex items-center gap-1 hover:text-foreground">
              <ArrowLeft className="size-3.5" /> Back to the Rulebook
            </Link>
          ) : null}
        </div>
      ) : null}
      <CatalogPasteBox autoFocus={false} />
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Which Libraries">
        {LIBRARY_LANES.map((l) => (
          <Chip key={l} active={l === lane} onClick={() => set("lane", l === "mine" ? null : l)}>
            {LIBRARY_LANE_LABEL[l]}
            <span className="tabular-nums opacity-70">{typeof laneCounts[l] === "number" ? laneCounts[l] : "—"}</span>
          </Chip>
        ))}
        {adapters.length ? (
          <button
            type="button"
            onClick={() => set("adapter", null)}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs hover:bg-accent"
            aria-label="Remove the source-type filter"
          >
            {adapters.map((a) => ADAPTER_WORDS[a] ?? a).join(", ")} <X className="h-3 w-3" />
          </button>
        ) : null}
        <Link
          href="/acquisition/blocks"
          className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          title="Libraries that stopped mid-sync, exports we recognise but cannot read, books we may not open"
        >
          Blocked
        </Link>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Libraries">
        {!organizationId && !orgResolved ? (
          <Notice>Opening your workspace…</Notice>
        ) : !organizationId ? (
          <Notice>
            Libraries are listed for the organization you are working in, and none is chosen yet. Choose one with the
            organization button in the header and they appear here.
          </Notice>
        ) : read.status === "loading" ? (
          <Notice>Reading your Libraries…</Notice>
        ) : null}
        {read.status === "error" ? (
          <Notice tone="error">
            {read.error} Nothing is listed because the read failed.
            <ErrorAlchemyMenu error={read.error} size="xs" />{" "}
            <button type="button" className="underline underline-offset-2" onClick={() => setAttempt((n) => n + 1)}>
              Retry
            </button>
          </Notice>
        ) : null}
        {read.status === "ready" && !read.rows.length ? (
          <Notice>
            {words || adapters.length
              ? "No Library matches these filters."
              : `No Libraries in “${LIBRARY_LANE_LABEL[lane]}”. Paste a YouTube channel, a podcast feed, a blog, or a slide deck link above; the whole catalogue lists in seconds.`}
          </Notice>
        ) : null}
        {read.problems.length ? (
          <Notice tone="error">
            {plural(read.problems.length, "Library", "Libraries")} could not be read and {read.problems.length === 1 ? "is" : "are"} left out: {read.problems[0]}
            <ErrorAlchemyMenu error={read.problems[0]} size="xs" />
          </Notice>
        ) : null}
        {read.rows.map((r) => (
          <RowLink
            key={r.id}
            href={libraryRecordHref(r.id)}
            icon={Library}
            title={r.name}
            count={r.item_count == null ? null : plural(r.item_count, "Source")}
            description={r.sync_status === "failed" ? r.sync_error : r.description}
            descriptionIsError={r.sync_status === "failed" && Boolean(r.sync_error)}
            meta={[
              ADAPTER_WORDS[r.adapter] ?? r.adapter,
              SYNC_WORDS[r.sync_status],
              r.last_synced_at ? `brought up to date ${formatRelativeTime(r.last_synced_at)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            trailing={
              <>
                <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title="Bring up to date">
                  <Link href={`${libraryRecordHref(r.id)}?resync=1`}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Bring up to date</span>
                  </Link>
                </Button>
                <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title="This Library's Sources in the hub">
                  <Link
                    href={hubHref({
                      ...DEFAULT_HUB_STATE,
                      view: { kind: "container", type: "media_source_library", id: r.id },
                      query: { mode: "find", within: [{ type: "media_source_library", id: r.id }] },
                    })}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Sources</span>
                  </Link>
                </Button>
              </>
            }
          />
        ))}
        {read.status === "ready" && read.rows.length < read.total ? (
          <div className="px-2 py-2 text-xs">
            <Button size="sm" variant="outline" className="h-7" disabled={more.loading} onClick={() => void loadMore()}>
              {more.loading ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              Load more ({read.rows.length} of {read.total})
            </Button>
            {more.error ? (
              <span className="ml-2 text-destructive">
                {more.error}
                <ErrorAlchemyMenu error={more.error} size="xs" />
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

// ─── The Matrx Library catalog ──────────────────────────────────────────────

const CATALOG_ICON: Record<LibraryEntityType, React.ComponentType<{ className?: string }>> = {
  data_store: Library,
  seo_starter_pack: Boxes,
  rulebook: ScrollText,
};

function entitlementWords(it: { subscribed: boolean; entitledVia: string | null; entitledIndustryName: string | null }): string | null {
  if (it.subscribed) return "Subscribed";
  switch (it.entitledVia) {
    case "organization":
      return "Your organization has it";
    case "industry":
      return it.entitledIndustryName ? `Via ${it.entitledIndustryName}` : "Via your industry";
    case "global":
      return "Available to everyone";
    case "admin":
      return "Admin access";
    case "curator":
      return "You curate it";
    default:
      return "Not in your organization yet";
  }
}

function CatalogGroup({ group, set }: { group: Group; set: (k: string, v: string | null, replace?: boolean) => void }) {
  const catalog = useLibraryResources();
  const userId = useAppSelector(selectUserId);
  const loading = catalog.loading || !userId;
  const curatorships = useMyCuratorships();
  const isCurator = (curatorships.data?.length ?? 0) > 0;
  const type = catalogType(group);
  const entitledOnly = catalogEntitledOnly(group);
  const rows = filterCatalog(catalog.items, group, (t) => LIBRARY_TYPE_LABEL[t as LibraryEntityType] ?? t);
  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip active={type === "all"} onClick={() => set("type", null)}>
          Everything <span className="tabular-nums opacity-70">{catalog.error ? "—" : catalog.items.length}</span>
        </Chip>
        {CATALOG_TYPES.map((t) => (
          <Chip key={t} active={type === t} onClick={() => set("type", t)}>
            {LIBRARY_TYPE_LABEL_PLURAL[t]}
            <span className="tabular-nums opacity-70">{catalog.error ? "—" : (catalog.countsByType[t] ?? 0)}</span>
          </Chip>
        ))}
        {isCurator ? (
          <Button asChild size="sm" variant="ghost" className="ml-auto h-7 gap-1 px-2 text-xs">
            <Link href="/knowledge/library-curate">
              <Layers className="h-3.5 w-3.5" /> Curate
            </Link>
          </Button>
        ) : null}
      </div>
      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={!entitledOnly}
          onChange={(e) => set("all", e.target.checked ? "1" : null)}
          className="h-3.5 w-3.5 accent-[var(--primary)]"
        />
        Show everything in the Library, not just my industry
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label="Library catalog">
        {loading && !catalog.items.length ? <Notice>Reading the Library…</Notice> : null}
        {catalog.error ? (
          <Notice tone="error">
            {catalog.error} Nothing is listed because the read failed.
            <ErrorAlchemyMenu error={catalog.error} size="xs" />{" "}
            <button type="button" className="underline underline-offset-2" onClick={catalog.refresh}>
              Retry
            </button>
          </Notice>
        ) : null}
        {!loading && !catalog.error && !rows.length ? (
          <Notice>
            {catalog.items.length === 0
              ? "Nothing in the Matrx Library reaches your organization yet."
              : entitledOnly && type === "all" && !groupWords(group)
                ? "Nothing in the Library is in your organization yet. Tick “Show everything” to browse the whole Library."
                : "Nothing matches your filters."}
          </Notice>
        ) : null}
        {rows.map((it) => (
          <RowLink
            key={`${it.entityType}:${it.id}`}
            href={catalogRecordHref(it.id, it.entityType)}
            icon={CATALOG_ICON[it.entityType] ?? Database}
            title={it.name}
            count={`${it.itemCount.toLocaleString()} ${itemNoun(it.entityType, it.itemCount)}`}
            description={it.description}
            meta={[LIBRARY_TYPE_LABEL[it.entityType], entitlementWords(it), it.updatedAt ? `updated ${formatRelativeTime(it.updatedAt)}` : null]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
      </div>
    </>
  );
}
