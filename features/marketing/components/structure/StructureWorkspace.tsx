"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Columns3,
  ExternalLink,
  FileText,
  FolderTree,
  Layers,
  ListTree,
  Network,
  Search,
} from "lucide-react";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useSiteStructure } from "@/features/marketing/data/hooks";
import {
  flattenRouteTree,
  searchRouteTree,
  type RouteTreeNode,
  type SiteRouteTree,
} from "@/features/marketing/lib/route-tree";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem } from "@/components/agent-copy/export";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";

/**
 * Structure — the site's ROUTING TREE, derived from the canonical page
 * registry's URL paths exactly as they exist (whether the routing makes
 * sense or not is what this view exposes). Two views over ONE tree:
 *
 * - Tree (default): expandable rows sorted smallest-section-first, each row
 *   carrying direct/total counts plus the cumulative per-level page counts.
 * - Columns: Finder-style drill-down for walking one branch at a time.
 *
 * Data model + sorting/count rules live in `lib/route-tree.ts` (pure,
 * unit-tested); the bounded fetch is `data/service.ts#fetchSiteStructureRows`.
 */

type StructureView = "tree" | "columns";

/** Collect the paths of every non-leaf node down to `depth` (inclusive). */
function pathsToDepth(node: RouteTreeNode, depth: number, into: Set<string>) {
  if (node.depth <= depth && node.childCount > 0) {
    into.add(node.path);
    for (const child of node.children) pathsToDepth(child, depth, into);
  }
}

function allBranchPaths(node: RouteTreeNode, into: Set<string>) {
  if (node.childCount > 0) {
    into.add(node.path);
    for (const child of node.children) allBranchPaths(child, into);
  }
}

function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "default" | "attention";
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border bg-card px-3 py-2",
        tone === "attention" &&
          value > 0 &&
          "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums text-foreground",
          tone === "attention" &&
            value > 0 &&
            "text-amber-600 dark:text-amber-400",
        )}
      >
        {value.toLocaleString()}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

/** The compact cumulative-level chips a branch row carries. */
function LevelChips({ node }: { node: RouteTreeNode }) {
  if (!node.levelCounts.length) return null;
  const shown = node.levelCounts.slice(0, 3);
  const total = node.subtreePages;
  return (
    <span className="hidden items-center gap-1 lg:inline-flex">
      {shown.map((count) => (
        <span
          key={count.level}
          title={`${count.cumulativePages.toLocaleString()} pages within ${count.level} level${count.level === 1 ? "" : "s"} below (this page included); ${count.pages.toLocaleString()} exactly at that level`}
          className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
        >
          {"≤"}
          {count.level}: {count.cumulativePages.toLocaleString()}
        </span>
      ))}
      {node.levelCounts.length > shown.length ? (
        <span
          title={`${total.toLocaleString()} pages in the entire branch`}
          className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-foreground"
        >
          all: {total.toLocaleString()}
        </span>
      ) : null}
    </span>
  );
}

function StatusBadge({ status }: { status: number | null }) {
  if (status === null || (status >= 200 && status < 300)) return null;
  const bad = status >= 400;
  return (
    <span
      title={`Last observed HTTP status: ${status}`}
      className={cn(
        "rounded px-1 py-0.5 text-[10px] font-semibold tabular-nums",
        bad
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      {status}
    </span>
  );
}

function TreeRow({
  node,
  isRoot,
  expanded,
  highlighted,
  onToggle,
  pageHref,
  liveHref,
}: {
  node: RouteTreeNode;
  isRoot: boolean;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
  pageHref: (node: RouteTreeNode) => string | null;
  liveHref: (node: RouteTreeNode) => string;
}) {
  const page = node.pages[0];
  const detail = pageHref(node);
  return (
    <div
      className={cn(
        "group/row flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted/40",
        highlighted && "bg-primary/5 ring-1 ring-inset ring-primary/30",
      )}
      style={{ paddingLeft: `${node.depth * 18 + 8}px` }}
    >
      {node.childCount > 0 ? (
        <button
          type="button"
          onClick={onToggle}
          aria-label={expanded ? "Collapse" : "Expand"}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      ) : (
        <span className="h-4 w-4 shrink-0" />
      )}

      <span
        className={cn(
          "shrink-0 font-mono text-xs",
          node.virtual ? "text-muted-foreground/70" : "text-foreground",
        )}
      >
        {isRoot ? "/" : node.segment}
      </span>

      {node.virtual ? (
        <span
          title="No page is recorded at this exact path — it only exists as a prefix of deeper URLs."
          className="shrink-0 rounded border border-dashed border-border px-1 py-0.5 text-[10px] text-muted-foreground"
        >
          no page
        </span>
      ) : null}
      {node.pages.length > 1 ? (
        <span
          title={node.pages.map((variant) => variant.url).join("\n")}
          className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] tabular-nums text-muted-foreground"
        >
          {node.pages.length} URLs
        </span>
      ) : null}
      <StatusBadge status={page?.httpStatus ?? null} />

      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {isRoot ? "Home page" : (page?.title ?? "")}
      </span>

      <LevelChips node={node} />

      {node.childCount > 0 ? (
        <span
          title={`${node.childCount.toLocaleString()} direct child route${node.childCount === 1 ? "" : "s"}`}
          className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground"
        >
          {node.childCount.toLocaleString()} sub
        </span>
      ) : null}
      <span
        title={`${node.subtreePages.toLocaleString()} total page${node.subtreePages === 1 ? "" : "s"} in this branch (this page included)`}
        className="w-12 shrink-0 text-right text-xs font-medium tabular-nums text-foreground"
      >
        {node.subtreePages.toLocaleString()}
      </span>

      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100">
        {detail ? (
          <Link
            href={detail}
            title="Open the page workspace"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <FileText className="h-3.5 w-3.5" />
          </Link>
        ) : null}
        <a
          href={liveHref(node)}
          target="_blank"
          rel="noreferrer"
          title="Open on the live site"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </span>
    </div>
  );
}

function ColumnsView({
  tree,
  pageHref,
  liveHref,
}: {
  tree: SiteRouteTree;
  pageHref: (node: RouteTreeNode) => string | null;
  liveHref: (node: RouteTreeNode) => string;
}) {
  const [trail, setTrail] = useState<string[]>([]);

  // Resolve the trail against the current tree (a refetch may drop nodes).
  const columns: RouteTreeNode[] = [tree.root];
  for (const path of trail) {
    const next = columns[columns.length - 1].children.find(
      (child) => child.path === path,
    );
    if (!next) break;
    columns.push(next);
  }
  const selected = columns[columns.length - 1];
  const detail = pageHref(selected);

  return (
    <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto pb-1">
      {columns.map((column, index) =>
        column.childCount === 0 ? null : (
          <div
            key={column.path}
            className="flex w-60 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
          >
            <p className="border-b border-border px-2.5 py-1.5 font-mono text-[11px] font-medium text-muted-foreground">
              {column.depth === 0 ? "/" : column.path}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
              {column.children.map((child) => {
                const active = trail[index] === child.path;
                return (
                  <button
                    key={child.path}
                    type="button"
                    onClick={() =>
                      setTrail([...trail.slice(0, index), child.path])
                    }
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left hover:bg-muted/50",
                      active && "bg-primary/10 hover:bg-primary/10",
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-mono text-xs",
                        child.virtual
                          ? "text-muted-foreground/70"
                          : "text-foreground",
                      )}
                    >
                      {child.segment}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                      {child.subtreePages.toLocaleString()}
                    </span>
                    {child.childCount > 0 ? (
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <span className="w-3 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ),
      )}

      <div className="flex w-72 shrink-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <p className="break-all font-mono text-xs font-medium text-foreground">
          {selected.path}
        </p>
        {selected.virtual ? (
          <p className="text-[11px] text-muted-foreground">
            No page is recorded at this exact path — it only exists as a
            prefix of deeper URLs.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {selected.pages[0]?.title ?? "No observed title yet."}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">Pages here</dt>
          <dd className="text-right tabular-nums text-foreground">
            {selected.pages.length.toLocaleString()}
          </dd>
          <dt className="text-muted-foreground">Direct children</dt>
          <dd className="text-right tabular-nums text-foreground">
            {selected.childCount.toLocaleString()}
          </dd>
          <dt className="text-muted-foreground">Branch total</dt>
          <dd className="text-right tabular-nums text-foreground">
            {selected.subtreePages.toLocaleString()}
          </dd>
          {selected.levelCounts.map((count) => (
            <div key={count.level} className="contents">
              <dt className="text-muted-foreground">
                Within {count.level} level{count.level === 1 ? "" : "s"}
              </dt>
              <dd className="text-right tabular-nums text-foreground">
                {count.cumulativePages.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-auto flex items-center gap-2">
          {detail ? (
            <Link
              href={detail}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
            >
              <FileText className="h-3 w-3" />
              Page workspace
            </Link>
          ) : null}
          <a
            href={liveHref(selected)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-muted"
          >
            <ExternalLink className="h-3 w-3" />
            Live URL
          </a>
        </div>
      </div>
    </div>
  );
}

export function StructureWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const structure = useSiteStructure(site.id);

  const [view, setView] = useState<StructureView>("tree");
  /** null = every level; N = render nothing deeper than depth N. */
  const [depthFilter, setDepthFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [manualExpanded, setManualExpanded] = useState<Set<string>>(
    () => new Set(["/"]),
  );

  if (structure.isLoading)
    return <LoadingSurface label="Loading site structure…" />;
  if (structure.isError) {
    return (
      <QueryError
        error={structure.error}
        onRetry={() => void structure.refetch()}
      />
    );
  }
  const tree = structure.data;
  if (!tree) return <LoadingSurface label="Loading site structure…" />;

  let origin = site.root_url;
  try {
    origin = new URL(site.root_url).origin;
  } catch {
    // keep root_url as-is
  }
  const pageHref = (node: RouteTreeNode) =>
    node.pages[0] ? `${sitePath}/pages/${node.pages[0].pageId}` : null;
  const liveHref = (node: RouteTreeNode) =>
    node.path === "/" ? origin : `${origin}${node.path}`;

  // Search wins (its expand set makes every match reachable); an active
  // level filter force-expands everything above the cutoff; otherwise the
  // user's manual expand state governs.
  const searchState = searchRouteTree(tree.root, query);
  const searching = query.trim().length > 0;
  let expanded = manualExpanded;
  if (searching) {
    expanded = searchState.expand;
  } else if (depthFilter !== null) {
    const all = new Set<string>();
    pathsToDepth(tree.root, depthFilter - 1, all);
    expanded = all;
  }
  const rows = flattenRouteTree(
    tree.root,
    expanded,
    searching ? null : depthFilter,
  );

  const structureCopy = webCopy({
    kind: "web-site-structure",
    label: "Site structure",
    description:
      "The site's routing tree derived from the canonical page registry: every URL path as a node with per-level page counts, cumulative totals, and route gaps (prefixes with no recorded page).",
    surface: `Structure — ${site.root_url}`,
    data: tree,
    lines: [
      ["Site", site.root_url],
      ["Total pages", tree.totalPages],
      ["Routes", tree.totalRoutes],
      ["Route gaps (no page)", tree.virtualRoutes],
      ["Max depth", tree.maxDepth],
      ...tree.levelBreakdown.map(
        (level): [string, string] => [
          `Level ${level.depth}`,
          `${level.routes.toLocaleString()} routes · ${level.pages.toLocaleString()} pages · ${level.cumulativePages.toLocaleString()} cumulative`,
        ],
      ),
    ],
    attributes: { site_id: site.id },
  });

  const expandAll = () => {
    const all = new Set<string>();
    allBranchPaths(tree.root, all);
    setManualExpanded(all);
  };

  return (
    <main className="flex h-full flex-col overflow-hidden bg-textured p-3 sm:p-4">
      <div className="flex min-h-0 w-full flex-1 flex-col gap-3">
        <header className="flex shrink-0 items-start justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Network className="h-4 w-4 text-muted-foreground" />
              Structure
            </h1>
            <p className="text-xs text-muted-foreground">
              The routing tree exactly as the site's URLs define it — smallest
              sections first, with page totals at every level.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <CopyButtons
              size="icon"
              label={structureCopy.label}
              human={structureCopy.human}
              json={() => tree}
              agent={structureCopy.agent}
            />
            <ExportMenu
              label={`site-structure-${site.domain}`}
              items={[jsonExportItem(() => tree, "Routing tree (.json)")]}
            />
          </div>
        </header>

        <section className="grid shrink-0 gap-2 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
          <StatTile
            label="Total pages"
            value={tree.totalPages}
            hint="Every canonical URL recorded"
          />
          <StatTile
            label="Routes"
            value={tree.totalRoutes}
            hint="Unique URL paths below the home page"
          />
          <StatTile
            label="Top-level sections"
            value={tree.root.childCount}
            hint="Paths directly under the home page"
          />
          <StatTile
            label="Max depth"
            value={tree.maxDepth}
            hint="Deepest nesting level"
          />
          <StatTile
            label="Route gaps"
            value={tree.virtualRoutes}
            hint="Prefixes with no recorded page"
            tone="attention"
          />
        </section>

        {tree.levelBreakdown.length > 0 ? (
          <section className="shrink-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <Layers className="h-3 w-3" />
                Levels
              </span>
              <button
                type="button"
                onClick={() => setDepthFilter(null)}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium",
                  depthFilter === null
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                All levels
              </button>
              {tree.levelBreakdown.map((level) => (
                <button
                  key={level.depth}
                  type="button"
                  onClick={() =>
                    setDepthFilter(
                      depthFilter === level.depth ? null : level.depth,
                    )
                  }
                  title={`${level.routes.toLocaleString()} routes and ${level.pages.toLocaleString()} pages at level ${level.depth}; ${level.cumulativePages.toLocaleString()} pages within ${level.depth} level${level.depth === 1 ? "" : "s"} of the home page`}
                  className={cn(
                    "rounded-md border px-2 py-1 text-[11px]",
                    depthFilter === level.depth
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                  )}
                >
                  <span className="font-medium">L{level.depth}</span>
                  <span className="ml-1 tabular-nums">
                    {level.pages.toLocaleString()} pages
                  </span>
                  <span className="ml-1 tabular-nums opacity-70">
                    {"≤"}
                    {level.cumulativePages.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="flex shrink-0 flex-wrap items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by path or title…"
              className="h-8 w-56 rounded-md border border-border bg-card pl-7 pr-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 sm:h-7 sm:text-xs"
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {view === "tree" ? (
              <>
                <button
                  type="button"
                  onClick={expandAll}
                  className="rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={() => setManualExpanded(new Set(["/"]))}
                  className="rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  Collapse all
                </button>
              </>
            ) : null}
            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setView("tree")}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium",
                  view === "tree"
                    ? "bg-primary/10 text-primary"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <ListTree className="h-3 w-3" />
                Tree
              </button>
              <button
                type="button"
                onClick={() => setView("columns")}
                className={cn(
                  "inline-flex items-center gap-1 border-l border-border px-2 py-1 text-[11px] font-medium",
                  view === "columns"
                    ? "bg-primary/10 text-primary"
                    : "bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Columns3 className="h-3 w-3" />
                Columns
              </button>
            </div>
          </div>
        </section>

        {tree.totalPages === 0 ? (
          <div className="flex flex-1 items-start gap-3 rounded-lg border border-dashed border-border bg-card/50 p-4">
            <FolderTree className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                No pages recorded yet
              </p>
              <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                The routing tree builds from the canonical page registry. Run
                site initialize or a crawl, or sync sitemaps, and the
                structure will appear here.
              </p>
            </div>
          </div>
        ) : view === "columns" ? (
          <ColumnsView tree={tree} pageHref={pageHref} liveHref={liveHref} />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border bg-card py-1">
            {rows.map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                isRoot={node.depth === 0}
                expanded={expanded.has(node.path)}
                highlighted={searching && searchState.matches.has(node.path)}
                onToggle={() => {
                  // Toggling during search/level-filter adopts the derived
                  // expand state so the click does what the eye expects.
                  const next = new Set(expanded);
                  if (next.has(node.path)) next.delete(node.path);
                  else next.add(node.path);
                  setManualExpanded(next);
                  if (searching) setQuery("");
                  if (depthFilter !== null) setDepthFilter(null);
                }}
                pageHref={pageHref}
                liveHref={liveHref}
              />
            ))}
            {searching && searchState.matches.size === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No routes match "{query.trim()}".
              </p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
