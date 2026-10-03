"use client";

/**
 * /agents/all, rebuilt by hand on the settled 28px system — REAL rows from the
 * same reads the real page makes (`agx_list_scoped`, `agx_list_scope_counts`,
 * `agx_list_facets` via features/agents/browse/service). Read-only: favorites
 * show but don't toggle, and Archive only says what it would have done.
 *
 * Layout: ONE 28px toolbar row (lanes, org filter, search, filter/sort, New),
 * a hairline table of ≈36px rows, a footer row for paging. No card around the
 * list, no padding stacked inside padding.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Building2, Copy, ExternalLink, Hammer, Layers, Play, Search, SearchX, Star } from "lucide-react";
import { TapTargetButtonGroup } from "@ai-matrx/tap-target";
import {
  ArrowDownUpTapButton,
  ChevronLeftTapButton,
  ChevronRightTapButton,
  FilterTapButton,
  MoreHorizontalTapButton,
  PlayTapButton,
} from "@ai-matrx/tap-target/buttons";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { ReadFailure } from "@/components/read-state/ReadFailure";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { fetchAgentBrowsePage, fetchBrowseFacets, fetchBrowseScopeCounts } from "@/features/agents/browse/service";
import { agentHref, newAgentHref } from "@/features/agents/browse/agentPaths";
import type { AgentBrowseRow } from "@/features/agents/browse/types";
import type { EntityFacets, EntityListQuery, EntityScopeCounts } from "@/lib/entity-list/types";
import type { ListScopeKind } from "@/lib/list-scope/types";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { PlusGlyph } from "../../../_components/one-control";
import {
  CapsuleSeg,
  EmptyState,
  RowSkeletons,
  SampleScale,
  SampleTitle,
  ToneBadge,
  UcSelect,
  type TabItem,
} from "../../_components/kit";

const PAGE_SIZE = 25;

type Lane = Extract<ListScopeKind, "all" | "mine" | "team" | "orgs" | "shared" | "public" | "system">;
const LANES: { id: Lane; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "team", label: "My team" },
  { id: "orgs", label: "My Orgs" },
  { id: "shared", label: "Shared" },
  { id: "public", label: "Public" },
  { id: "system", label: "System" },
];

type SortKey = "updated-desc" | "created-desc" | "name-asc" | "name-desc" | "category-asc";
const SORTS: { id: SortKey; label: string; sort: string; dir: "asc" | "desc" }[] = [
  { id: "updated-desc", label: "Recently updated", sort: "updated", dir: "desc" },
  { id: "created-desc", label: "Recently created", sort: "created", dir: "desc" },
  { id: "name-asc", label: "Name A–Z", sort: "name", dir: "asc" },
  { id: "name-desc", label: "Name Z–A", sort: "name", dir: "desc" },
  { id: "category-asc", label: "Category", sort: "category", dir: "asc" },
];

const ALL_ORGS = "__all__";

/* Category → a token tint, stable per name (colour is a role, never a palette). */
const CATEGORY_TONES = ["primary", "info", "success", "warning"] as const;
function categoryTone(category: string) {
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return CATEGORY_TONES[h % CATEGORY_TONES.length];
}

function buildQuery(lane: Lane, orgId: string, search: string, categories: string[], page: number): EntityListQuery {
  return {
    scope: { kind: lane },
    orgId: orgId === ALL_ORGS ? null : orgId,
    search,
    deep: false,
    archived: "active",
    filters: categories.length > 0 ? { category: { kind: "select", values: categories } } : {},
    page,
  };
}

/** A read's answer, tagged with the request it answers — loading is "no answer for THIS request yet". */
type Answer<T> = { key: string; data: T; error: null } | { key: string; data: null; error: unknown };

export function AgentsAllSample() {
  const router = useRouter();
  const [lane, setLane] = useState<Lane>("all");
  const [orgId, setOrgId] = useState<string>(ALL_ORGS);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated-desc");
  const [categories, setCategories] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [answer, setAnswer] = useState<Answer<{ rows: AgentBrowseRow[]; total: number }> | null>(null);
  const [counts, setCounts] = useState<EntityScopeCounts | null>(null);
  const [facets, setFacets] = useState<EntityFacets | null>(null);
  const { organizations } = useUserOrganizations();

  // Debounce the search box into the query.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchDraft);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const [attempt, setAttempt] = useState(0);

  const requestKey = JSON.stringify([lane, orgId, search, categories, page, sortKey, attempt]);
  const rows =
    answer?.key !== requestKey
      ? ({ status: "loading" } as const)
      : answer.data
        ? ({ status: "ready", data: answer.data } as const)
        : ({ status: "error", error: answer.error } as const);

  useEffect(() => {
    let cancelled = false;
    const key = JSON.stringify([lane, orgId, search, categories, page, sortKey, attempt]);
    const sort = SORTS.find((s) => s.id === sortKey) ?? SORTS[0];
    fetchAgentBrowsePage(buildQuery(lane, orgId, search, categories, page), {
      sort: sort.sort,
      direction: sort.dir,
      favoritesFirst: true,
      pageSize: PAGE_SIZE,
    })
      .then((data) => !cancelled && setAnswer({ key, data, error: null }))
      .catch((err: unknown) => !cancelled && setAnswer({ key, data: null, error: err ?? new Error("The agents read failed") }));
    return () => {
      cancelled = true;
    };
  }, [lane, orgId, search, categories, page, sortKey, attempt]);

  useEffect(() => {
    let cancelled = false;
    const q = buildQuery(lane, orgId, search, categories, 1);
    fetchBrowseScopeCounts(q)
      .then((c) => !cancelled && setCounts(c))
      .catch((err: unknown) => console.error("[agents sample] lane counts failed:", err));
    fetchBrowseFacets(q)
      .then((f) => !cancelled && setFacets(f))
      .catch((err: unknown) => console.error("[agents sample] facets failed:", err));
    return () => {
      cancelled = true;
    };
  }, [lane, orgId, search, categories]);

  const laneItems: TabItem<Lane>[] = LANES.map((l) => ({ ...l, count: counts?.byKind[l.id] ?? null }));
  const laneOptions = laneItems.map((l) => ({ value: l.id, label: l.label, meta: l.count != null ? String(l.count) : undefined }));
  const orgOptions = [
    { value: ALL_ORGS, label: "All organizations" },
    ...organizations.map((o) => ({ value: o.id, label: o.name })),
  ];
  const categoryFacet = (facets?.byKind.category ?? []).slice(0, 14);
  const total = rows.status === "ready" ? rows.data.total : null;
  const lastPage = total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  const filtered = search.trim() !== "" || categories.length > 0;

  const resetFilters = () => {
    setSearchDraft("");
    setSearch("");
    setCategories([]);
    setPage(1);
  };

  return (
    <>
      <PageHeader>
        <SampleTitle icon={AGENT_ICON} title="Agents" meta="Sample" />
      </PageHeader>
      <SampleScale>
        <div className="uk-page flex h-full flex-col overflow-hidden bg-textured">
          {/* THE ONE TOOLBAR ROW — 28px controls, each carries its own 3px half-gap. */}
          <div className="@container shrink-0 border-b border-border">
          <div className="uc-row px-[9px] py-0.5">
            <div className="hidden @[70rem]:contents">
              <CapsuleSeg items={laneItems} value={lane} onChange={(v) => { setLane(v); setPage(1); }} ariaLabel="Access lane" />
            </div>
            <div className="contents @[70rem]:hidden">
              <UcSelect value={lane} options={laneOptions} onChange={(v) => { setLane(v); setPage(1); }} ariaLabel="Access lane" icon={Layers} width="8.5rem" />
            </div>
            <UcSelect value={orgId} options={orgOptions} onChange={(v) => { setOrgId(v); setPage(1); }} ariaLabel="Organization filter" icon={Building2} width="11rem" />
            <label className="uc-field flex-1 @[70rem]:max-w-[18rem]" style={{ minWidth: "9rem" }}>
              <Search aria-hidden />
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search agents"
                aria-label="Search agents"
              />
            </label>
            <span className="hidden flex-1 @[70rem]:block" />
            <TapTargetButtonGroup surface="solid">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <FilterTapButton variant="group" ariaLabel="Filter by category" pressed={categories.length > 0} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
                  <DropdownMenuLabel className="text-[0.6875rem] font-medium text-muted-foreground">Categories</DropdownMenuLabel>
                  {categoryFacet.map((f) => (
                    <DropdownMenuCheckboxItem
                      key={f.value}
                      className="text-[0.8125rem]"
                      checked={categories.includes(f.value)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(on) => {
                        setCategories((cur) => (on ? [...cur, f.value] : cur.filter((c) => c !== f.value)));
                        setPage(1);
                      }}
                    >
                      <span className="flex-1 truncate">{f.value === "__none__" ? "Uncategorized" : f.value}</span>
                      <span className="ml-2 text-[0.6875rem] text-muted-foreground">{f.count}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <ArrowDownUpTapButton variant="group" ariaLabel="Sort" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuRadioGroup value={sortKey} onValueChange={(v) => { setSortKey(v as SortKey); setPage(1); }}>
                    {SORTS.map((s) => (
                      <DropdownMenuRadioItem key={s.id} value={s.id} className="text-[0.8125rem]">
                        {s.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </TapTargetButtonGroup>
            <Link href={newAgentHref(false)} className="uc-btn uc-btn-primary" aria-label="New agent">
              <PlusGlyph />
              <span className="max-sm:sr-only">New agent</span>
            </Link>
          </div>
          </div>

          {/* Column header — 11px meta labels; hidden on phones. */}
          <div className="hidden h-7 shrink-0 items-center gap-3 border-b border-border pl-3 pr-[9px] text-[0.6875rem] font-medium text-muted-foreground md:flex">
            <span className="w-4" />
            <span className="w-[28%] min-w-0">Name</span>
            <span className="min-w-0 flex-1">Description</span>
            <span className="w-36 shrink-0">Category</span>
            <span className="w-20 shrink-0 text-right">Updated</span>
            <span className="w-[62px] shrink-0" />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.status === "loading" ? (
              <RowSkeletons count={14} />
            ) : rows.status === "error" ? (
              <ReadFailure error={rows.error} what="the agents" onRetry={() => setAttempt((n) => n + 1)} />
            ) : rows.data.rows.length === 0 ? (
              filtered ? (
                <EmptyState
                  icon={SearchX}
                  title="No agents match"
                  line="Nothing in this lane matches the search or filters."
                  action={
                    <button type="button" className="uc-btn uc-btn-outline" onClick={resetFilters}>
                      Clear filters
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={AGENT_ICON}
                  title={`No agents in ${LANES.find((l) => l.id === lane)?.label ?? "this lane"}`}
                  line="Agents you make or that are shared with you show here."
                  action={
                    <Link href={newAgentHref(false)} className="uc-btn uc-btn-primary">
                      <PlusGlyph /> New agent
                    </Link>
                  }
                />
              )
            ) : (
              <div className="divide-y divide-border">
                {rows.data.rows.map((row) => (
                  <AgentRow key={row.id} row={row} onOpen={() => router.push(agentHref(row))} />
                ))}
              </div>
            )}
          </div>

          {/* Footer — paging, one row. */}
          <div className="uc-row shrink-0 border-t border-border px-[9px]">
            <span className="mx-[3px] text-[0.6875rem] text-muted-foreground">
              {rows.status === "error"
                ? "Not loaded"
                : total == null
                ? "Loading…"
                : total === 0
                  ? "0 agents"
                  : `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}
            </span>
            <span className="flex-1" />
            <span className="mx-[3px] text-[0.6875rem] text-muted-foreground">
              Page {page} of {lastPage}
            </span>
            <ChevronLeftTapButton variant="transparent" ariaLabel="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} />
            <ChevronRightTapButton variant="transparent" ariaLabel="Next page" disabled={page >= lastPage} onClick={() => setPage((p) => Math.min(lastPage, p + 1))} />
          </div>
        </div>
      </SampleScale>
    </>
  );
}

function AgentRow({ row, onOpen }: { row: AgentBrowseRow; onOpen: () => void }) {
  const href = agentHref(row);
  return (
    <div
      className="uk-row group flex min-h-9 cursor-pointer items-center gap-3 pl-3 pr-[9px]"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a,button,[role=menu]")) return;
        onOpen();
      }}
    >
      <Star
        className={cn("size-4 shrink-0", row.is_favorite ? "fill-warning text-warning" : "text-muted-foreground/40")}
        aria-label={row.is_favorite ? "Favorite" : undefined}
        aria-hidden={!row.is_favorite}
      />
      {/* Phone: name + one meta line. md+: columns. */}
      <div className="min-w-0 flex-1 py-1.5 md:hidden">
        <Link href={href} className="block truncate text-[0.8125rem] font-medium leading-4 hover:underline">
          {row.name || "Untitled agent"}
        </Link>
        <div className="truncate text-[0.6875rem] leading-4 text-muted-foreground">
          {[row.category, `Updated ${formatRelativeTime(row.updated_at)}`].filter(Boolean).join(" · ")}
        </div>
      </div>
      <Link
        href={href}
        className="hidden w-[28%] min-w-0 truncate text-[0.8125rem] font-medium hover:underline md:block"
      >
        {row.name || "Untitled agent"}
      </Link>
      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground md:block">{row.description || "—"}</span>
      <span className="hidden w-36 shrink-0 md:block">
        {row.category ? <ToneBadge tone={categoryTone(row.category)}>{row.category}</ToneBadge> : <span className="text-xs text-muted-foreground">—</span>}
      </span>
      <span className="hidden w-20 shrink-0 text-right text-[0.6875rem] text-muted-foreground md:block">
        {formatRelativeTime(row.updated_at)}
      </span>
      <span className="uk-quiet flex shrink-0 items-center">
        <PlayTapButton variant="transparent" ariaLabel={`Run ${row.name}`} href={agentHref(row, "/run")} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MoreHorizontalTapButton variant="transparent" ariaLabel={`More for ${row.name}`} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild className="text-[0.8125rem]">
              <Link href={href}>
                <ExternalLink className="size-4" /> Open
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="text-[0.8125rem]">
              <Link href={agentHref(row, "/run")}>
                <Play className="size-4" /> Run
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="text-[0.8125rem]">
              <Link href={agentHref(row, "/build")}>
                <Hammer className="size-4" /> Build
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[0.8125rem]"
              onSelect={() => {
                void navigator.clipboard.writeText(row.id).then(() => toast.success("Agent ID copied"));
              }}
            >
              <Copy className="size-4" /> Copy ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* Delete tier 1 (quiet): archive + undo in the toast. Sample: no write. */}
            <DropdownMenuItem
              className="text-[0.8125rem] text-destructive focus:text-destructive"
              disabled={!row.is_owner}
              onSelect={() => toast.success(`“${row.name}” would be archived`, { description: "Sample page — nothing was changed." })}
            >
              <Archive className="size-4" /> Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </div>
  );
}
