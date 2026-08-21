"use client";

/**
 * The site map — the plan drawn the way a WEBSITE is shaped (Arman's ruling,
 * 2026-08-20, replacing the React Flow dot graph): the home page at the top,
 * its pages branching below it, every page a real rectangular card whose
 * TITLE IS READABLE (wraps, centered — never truncated) with its route under
 * it, and visible connector lines showing exactly how pages branch. Plain
 * DOM + CSS: native two-axis scroll, no canvas zoom to fight, text at text
 * size.
 *
 *   · click a card            → opens that page in the node panel;
 *   · chevron on a card       → collapse/expand its branch (+N badge);
 *   · search + status/keyword → filter (ancestors of matches stay, dimmed);
 *   · left accent + dots      → status color, live-on-site, missing keyword.
 *
 * Reparenting and bulk edits live in the TREE view, which does them with
 * full labels and drop targets — this view is for seeing the site and going
 * places. Visibility math is shared with the tree (lib/tree-view.ts).
 */
import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { cn } from "@/lib/utils";

import { planStatusColor } from "../constants";
import type { PlanNodeRow, PlanNodeTreeItem } from "../types";
import { buildPlanTree } from "../types";
import { planNodeKeyFields, planNodeSummary } from "../format";
import { collapseVisible, filterWithAncestors } from "../lib/tree-view";

interface SiteMapProps {
  nodes: PlanNodeRow[];
  statusSlugById: Map<string, string>;
  /** Reality overlay: node_id → crawl match (present = live on the site). */
  liveById?: Map<string, { url: string }>;
  onSelect: (id: string) => void;
}

/** One page card. Title wraps (2 lines) and is never middle-truncated. */
function PageCard({
  item,
  statusSlug,
  isLive,
  dimmed,
  hiddenCount,
  collapsed,
  onSelect,
  onToggle,
}: {
  item: PlanNodeTreeItem;
  statusSlug: string | undefined;
  isLive: boolean;
  dimmed: boolean;
  hiddenCount: number;
  collapsed: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const node = item.node;
  const isTopLevel = node.node_type === "home" || node.node_type === "pillar";
  const hasBranch = item.children.length > 0 || hiddenCount > 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
      className={cn(
        "group/card flex w-60 cursor-pointer items-stretch overflow-hidden rounded-md border border-border bg-card shadow-sm transition-colors hover:border-primary/60",
        node.node_type === "home" && "ring-2 ring-primary/50 ring-offset-1 ring-offset-background",
        dimmed && "opacity-40",
      )}
    >
      <span
        className={cn("w-1 shrink-0", planStatusColor(statusSlug))}
        aria-hidden
      />
      <span className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-2.5 py-1.5">
        <span
          className={cn(
            "line-clamp-2 w-full text-center text-xs leading-snug text-foreground",
            isTopLevel ? "font-semibold" : "font-medium",
          )}
        >
          {node.label}
        </span>
        {node.route ? (
          <span className="w-full truncate text-center font-mono text-[10px] text-muted-foreground">
            {node.route}
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          {isLive ? (
            <span
              className="h-1.5 w-1.5 rounded-full bg-emerald-500"
              aria-label="Live on the site"
            />
          ) : null}
          {node.primary_keyword_id == null && node.node_type !== "home" ? (
            <span
              className="h-1.5 w-1.5 rounded-full border border-amber-500"
              aria-label="No target keyword yet"
            />
          ) : null}
          {hasBranch ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onToggle(node.id);
              }}
              className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={collapsed ? "Expand this branch" : "Collapse this branch"}
            >
              {collapsed ? (
                <>
                  <ChevronDown className="h-3 w-3" />
                  {hiddenCount}
                </>
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
            </button>
          ) : null}
        </span>
      </span>
    </div>
  );
}

/** A card plus its children as a connected vertical stack (recursive). */
function Branch({
  item,
  render,
}: {
  item: PlanNodeTreeItem;
  render: (item: PlanNodeTreeItem) => React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {render(item)}
      {item.children.length > 0 ? (
        <div className="relative ml-5 mt-1.5 flex flex-col gap-1.5 border-l border-border pl-3">
          {item.children.map((child) => (
            <div key={child.node.id} className="relative">
              <span
                className="absolute -left-3 top-4 h-px w-3 bg-border"
                aria-hidden
              />
              <Branch item={child} render={render} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The ┬ connector above each top-level column. The vertical stub drops onto
 * the CARD's center (cards are w-60 → center at 7.5rem, at the column's
 * left edge); the horizontal segments join the continuous spine under the
 * home card, spanning the inter-column gap.
 */
function ColumnConnector({ first, last }: { first: boolean; last: boolean }) {
  return (
    <div className="relative h-5" aria-hidden>
      <span className="absolute left-[7.5rem] top-0 h-full w-px bg-border" />
      {!first ? (
        <span className="absolute left-0 top-0 h-px w-[7.5rem] bg-border" />
      ) : null}
      {!last ? (
        <span className="absolute left-[7.5rem] right-0 top-0 h-px bg-border" />
      ) : null}
    </div>
  );
}

export function SiteMap({
  nodes,
  statusSlugById,
  liveById,
  onSelect,
}: SiteMapProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [keywordFilter, setKeywordFilter] = useState<string>("all");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const statusCategories = useCategories({
    dimension: CATEGORY_DIMENSIONS.planStatus,
  });

  // Filter (keeping ancestors, dimmed) then collapse — both pure and shared
  // with the tree view.
  const searchLower = search.trim().toLowerCase();
  const { rows: filteredRows, dimmed } = useMemo(
    () =>
      filterWithAncestors(nodes, (node) => {
        if (
          statusFilter !== "all" &&
          statusSlugById.get(node.status_id ?? "") !== statusFilter
        ) {
          return false;
        }
        if (keywordFilter === "has" && !node.primary_keyword_id) return false;
        if (keywordFilter === "missing" && node.primary_keyword_id) return false;
        if (searchLower) {
          const haystack =
            `${node.label}\n${node.route ?? ""}\n${node.slug ?? ""}`.toLowerCase();
          if (!haystack.includes(searchLower)) return false;
        }
        return true;
      }),
    [nodes, statusFilter, keywordFilter, searchLower, statusSlugById],
  );

  const filtersActive =
    searchLower.length > 0 || statusFilter !== "all" || keywordFilter !== "all";

  // While a search/filter is active the collapse set is bypassed so every
  // match is visible (same rule as the tree view).
  const { rows: visible, hiddenCounts } = useMemo(
    () => collapseVisible(filteredRows, filtersActive ? new Set() : collapsed),
    [filteredRows, collapsed, filtersActive],
  );

  const roots = useMemo(() => buildPlanTree(visible), [visible]);

  const expandableIds = useMemo(() => {
    const parents = new Set<string>();
    for (const node of nodes) {
      if (node.parent_id) parents.add(node.parent_id);
    }
    return parents;
  }, [nodes]);

  const toggleBranch = (id: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const collapseBranches = () => {
    // Collapse every top-level branch (home stays open so the first tier is
    // always on screen — the site overview).
    const homeChildren = nodes.filter((node) => {
      if (!node.parent_id) return false;
      const parent = nodes.find((candidate) => candidate.id === node.parent_id);
      return parent != null && parent.parent_id == null;
    });
    const rootIds = nodes.filter((node) => node.parent_id == null);
    const targets = [...homeChildren, ...rootIds.filter((node) => node.node_type !== "home")]
      .filter((node) => expandableIds.has(node.id))
      .map((node) => node.id);
    setCollapsed(new Set(targets));
  };

  // The home page crowns the map; its children are the connected columns.
  // Stray extra roots (pages planned without a parent) become columns too —
  // the site never hides a page just because its parent link is missing.
  const homeRoot =
    roots.find((root) => root.node.node_type === "home") ??
    (roots.length === 1 ? roots[0] : null);
  const columns = homeRoot
    ? [...homeRoot.children, ...roots.filter((root) => root !== homeRoot)]
    : roots;

  const renderCard = (item: PlanNodeTreeItem) => (
    <PageCard
      item={item}
      statusSlug={statusSlugById.get(item.node.status_id ?? "")}
      isLive={liveById?.has(item.node.id) ?? false}
      dimmed={dimmed.has(item.node.id)}
      hiddenCount={hiddenCounts.get(item.node.id) ?? 0}
      collapsed={collapsed.has(item.node.id)}
      onSelect={onSelect}
      onToggle={toggleBranch}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search pages…"
          className="h-7 w-52 text-xs"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-7 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {statusCategories.categories.map((category) => (
              <SelectItem key={category.id} value={category.slug ?? category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={keywordFilter} onValueChange={setKeywordFilter}>
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Keyword: any</SelectItem>
            <SelectItem value="has">Has keyword</SelectItem>
            <SelectItem value="missing">Missing keyword</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={
            collapsed.size > 0 ? () => setCollapsed(new Set()) : collapseBranches
          }
        >
          {collapsed.size > 0 ? "Expand all" : "Collapse branches"}
        </Button>
        <CopyButtons
          size="icon"
          label="Site map"
          human={() =>
            [
              `Site map — ${visible.length} of ${nodes.length} pages shown`,
              ...visible.map(planNodeSummary),
            ].join("\n")
          }
          json={() => visible.map(planNodeKeyFields)}
          agentVariant={{
            id: "this-view",
            label: "This view",
            hint: "The pages on screen, with the active search and filters",
            position: "first",
          }}
          agent={() => ({
            kind: "plan_site_map_view",
            location: webLocation("Content Plan — site map"),
            description:
              "The site map as rendered: the pages currently shown, and the search/filters that produced them.",
            data: {
              pages: visible.map((node) => ({
                ...planNodeKeyFields(node),
                dimmed: dimmed.has(node.id),
                collapsed_descendants: hiddenCounts.get(node.id) ?? 0,
              })),
            },
            attributes: {
              rows: visible.length,
              pages_planned: nodes.length,
            },
            context: {
              search,
              status_filter: statusFilter,
              keyword_filter: keywordFilter,
              collapsed_branches: collapsed.size,
            },
          })}
          aiVariants={[
            {
              id: "everything",
              label: "Everything",
              hint: "Every planned page, ignoring the map's filters",
              build: () => ({
                kind: "plan_site_map",
                location: webLocation("Content Plan — site map"),
                description:
                  "Every page in this plan (the whole tree behind the site map, ignoring its filters).",
                data: { pages: nodes.map(planNodeKeyFields) },
                attributes: {
                  detail: "everything",
                  pages_planned: nodes.length,
                },
              }),
            },
          ]}
        />
        <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            {visible.length === nodes.length
              ? `${nodes.length} pages`
              : `${visible.length} of ${nodes.length} pages`}
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> live
          </span>
          <span className="hidden items-center gap-1 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full border border-amber-500" />{" "}
            no keyword
          </span>
        </span>
      </div>
      {statusCategories.categories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1 text-[10px] text-muted-foreground">
          {statusCategories.categories.map((category) => (
            <span key={category.id} className="inline-flex items-center gap-1">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  planStatusColor(category.slug ?? category.id),
                )}
              />
              {category.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {nodes.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            No pages planned yet — use Setup or Generate to plan this site.
          </p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-start gap-2 p-6">
            <p className="text-sm text-muted-foreground">
              No pages match the current search and filters.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setKeywordFilter("all");
              }}
            >
              Clear search &amp; filters
            </Button>
          </div>
        ) : (
          <div className="min-w-max p-6">
            {homeRoot ? (
              // Home sits above the FIRST column (not centered over the whole
              // row — a 300-page row is wider than any screen, and a centered
              // home would live off-screen). Its stub drops onto the spine at
              // the first column's connector.
              <div className="flex flex-col items-start">
                {renderCard(homeRoot)}
                {columns.length > 0 ? (
                  <>
                    <div
                      className="ml-[7.5rem] h-5 w-px bg-border"
                      aria-hidden
                    />
                    <div className="flex items-start">
                      {columns.map((column, index) => (
                        <div
                          key={column.node.id}
                          className={cn(
                            "flex flex-col",
                            index < columns.length - 1 && "pr-5",
                          )}
                        >
                          <ColumnConnector
                            first={index === 0}
                            last={index === columns.length - 1}
                          />
                          <Branch item={column} render={renderCard} />
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="flex items-start gap-4">
                {columns.map((column) => (
                  <Branch
                    key={column.node.id}
                    item={column}
                    render={renderCard}
                  />
                ))}
              </div>
            )}
            {filtersActive ? (
              <p className="mt-4 text-[11px] text-muted-foreground">
                Faded pages don&apos;t match the search or filters — they stay so
                the site never loses its shape.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
