// features/marketing/components/inspection/link-graph/LinkGraphView.tsx
//
// The site link-graph surface: owns the edge fetch, the pure model build, and
// the chrome (toolbar / legend / stats / side panel). The cytoscape surface is
// loaded via next/dynamic({ ssr: false }) — cytoscape touches `window` at
// import — and only renders once data is ready (the condition earns the split).

"use client";

import { type CSSProperties, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ChevronRight,
  ExternalLink,
  FolderTree,
  Globe,
  Link2Off,
  Network,
  Palette,
  Search,
  SplitSquareHorizontal,
  X,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import {
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useLinkGraphEdges } from "@/features/marketing/data/inspection-hooks";
import { webCopy } from "@/features/marketing/lib/copy-payloads";

import {
  buildLinkGraph,
  buildSectionGraph,
  displayUrl,
  type LinkGraphModel,
  type LinkGraphNode,
  type SectionGraphNode,
} from "./model";
import {
  depthColor,
  LINK_DEPTH_LABELS,
  LINK_EXTERNAL_COLOR,
  LINK_STATUS_COLORS,
  LINK_STATUS_LABELS,
  LINK_UNREACHED_COLOR,
  nodeColor,
  nodeSize,
  sectionSize,
  type LinkColorMode,
} from "./style";
import { LINK_LAYOUTS, type LinkLayoutId } from "./layouts";

// cytoscape + extensions touch window at import → must be client-only.
const LinkGraphCytoscape = dynamic(() => import("./LinkGraphCytoscape"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

const NODE_CAPS = [
  { id: "overview", label: "Overview", cap: 150 },
  { id: "standard", label: "Standard", cap: 400 },
  { id: "max", label: "Maximum", cap: 1200 },
] as const;
type NodeCapId = (typeof NODE_CAPS)[number]["id"];

const SELECT_TRIGGER = "h-8 w-[150px] shrink-0 text-xs";

// shadcn SelectTrigger's `[&>span]:line-clamp-1` stacks a leading icon above
// the label; inline style outranks it (see kg-graph's identical fix).
const TRIGGER_INNER: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.375rem",
  minWidth: 0,
};

function ToggleChip({
  active,
  onClick,
  icon,
  label,
  title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </span>
  );
}

function GraphLegend({
  colorMode,
  showExternal,
}: {
  colorMode: LinkColorMode;
  showExternal: boolean;
}) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1 rounded-md border border-border bg-card/85 px-2.5 py-2 shadow-sm backdrop-blur">
      {colorMode === "depth"
        ? [
            ...LINK_DEPTH_LABELS.map((label, index) => (
              <LegendSwatch
                key={label}
                color={depthColor(index)}
                label={label}
              />
            )),
            <LegendSwatch
              key="unreached"
              color={LINK_UNREACHED_COLOR}
              label="Not reached from home"
            />,
          ]
        : (
            Object.keys(LINK_STATUS_LABELS) as Array<
              keyof typeof LINK_STATUS_LABELS
            >
          ).map((status) => (
            <LegendSwatch
              key={status}
              color={LINK_STATUS_COLORS[status]}
              label={LINK_STATUS_LABELS[status]}
            />
          ))}
      {showExternal ? (
        <LegendSwatch color={LINK_EXTERNAL_COLOR} label="External (diamond)" />
      ) : null}
    </div>
  );
}

function NodePanel({
  node,
  model,
  rootUrl,
  sitePath,
  onClose,
}: {
  node: LinkGraphNode;
  model: LinkGraphModel;
  rootUrl: string;
  sitePath: string;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const inboundAnchors = useMemo(() => {
    const anchors = new Map<string, number>();
    for (const edge of model.edges) {
      if (edge.target !== node.id) continue;
      for (const anchor of edge.anchors) {
        anchors.set(anchor, (anchors.get(anchor) ?? 0) + edge.weight);
      }
    }
    return Array.from(anchors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [model.edges, node.id]);

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col overflow-hidden border-border bg-card",
        isMobile
          ? "absolute inset-x-0 bottom-0 z-10 max-h-[55%] rounded-t-lg border-t shadow-lg"
          : "w-80 shrink-0 border-l",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-foreground">
            {node.label}
          </p>
          <a
            href={node.fullUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-0.5 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-primary"
          >
            <span className="truncate">{node.fullUrl}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>
        <button
          type="button"
          aria-label="Close details"
          onClick={onClose}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge value={node.external ? "external" : "internal"} />
          {node.isRoot ? <Badge variant="outline">Homepage</Badge> : null}
          <Badge variant="outline" className="font-mono tabular-nums">
            HTTP {node.httpStatus ?? "—"}
          </Badge>
          {node.depth !== null ? (
            <Badge variant="outline">
              {node.depth === 0 ? "Home" : `${node.depth} click${node.depth === 1 ? "" : "s"} deep`}
            </Badge>
          ) : node.external ? null : (
            <Badge variant="warning">Not reachable from home</Badge>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Inlinks
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
              {node.inlinks.toLocaleString()}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Outlinks
            </dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-foreground">
              {node.outlinks.toLocaleString()}
            </dd>
          </div>
        </dl>
        {node.queryVariants.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Query variants ({node.queryVariants.length})
            </p>
            <ul className="mt-1 space-y-1">
              {node.queryVariants.slice(0, 8).map((variant) => (
                <li
                  key={variant}
                  className="truncate font-mono text-[11px] text-foreground"
                  title={`?${variant}`}
                >
                  ?{variant}
                </li>
              ))}
              {node.queryVariants.length > 8 ? (
                <li className="text-[11px] text-muted-foreground">
                  +{node.queryVariants.length - 8} more
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
        {inboundAnchors.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Linked with anchor text
            </p>
            <ul className="mt-1 space-y-1">
              {inboundAnchors.map(([anchor, count]) => (
                <li
                  key={anchor}
                  className="flex items-baseline justify-between gap-2 text-[11px]"
                >
                  <span className="min-w-0 truncate text-foreground">
                    “{anchor}”
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    ×{count}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {node.pageId ? (
          <Link
            href={`${sitePath}/pages/${node.pageId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            Open page workspace
            <ExternalLink className="h-3 w-3" />
          </Link>
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Shown as {displayUrl(node.fullUrl, rootUrl)} — the site base is
          stripped from labels.
        </p>
      </div>
    </aside>
  );
}

/** Drill-down panel for one aggregated section. */
function SectionPanel({
  node,
  sitePath,
  onDrillIn,
  onClose,
}: {
  node: SectionGraphNode;
  sitePath: string;
  onDrillIn: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-semibold text-foreground">
            {node.path}
          </p>
          <p className="text-[11px] capitalize text-muted-foreground">
            {node.kind === "external" ? "External domain" : node.kind}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-[11px]">
        <dl className="grid grid-cols-2 gap-2">
          {[
            ["Pages", node.pageCount],
            ["Inbound links", node.inlinks],
            ["Outbound links", node.outlinks],
            ["Links within", node.internalLinks],
            ["Broken", node.brokenPages],
            ["Orphans", node.orphanPages],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {(value as number).toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
        {node.depth !== null ? (
          <p className="text-muted-foreground">
            Shallowest page is{" "}
            <span className="font-semibold text-foreground">
              {node.depth === 0 ? "the homepage" : `${node.depth} click(s) from home`}
            </span>
            .
          </p>
        ) : (
          <p className="text-amber-600 dark:text-amber-400">
            No page in this section is reachable from the homepage.
          </p>
        )}
        {node.drillable ? (
          <button
            type="button"
            onClick={onDrillIn}
            className="w-full rounded-md border border-border px-2 py-1.5 font-medium text-foreground transition-colors hover:bg-accent"
          >
            Open this section
          </button>
        ) : null}
        {node.pageId ? (
          <Link
            href={`${sitePath}/pages/${node.pageId}`}
            className="block truncate text-primary"
          >
            Open page record
          </Link>
        ) : null}
        {node.kind === "external" ? (
          <a
            href={node.representativeUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-primary"
          >
            {node.representativeUrl}
          </a>
        ) : null}
      </div>
    </aside>
  );
}

export function LinkGraphView({
  crawlId,
  onShowExternal,
}: {
  crawlId?: string;
  /** Jump to the outbound-links view (the External tab on the links page). */
  onShowExternal?: () => void;
}) {
  const { site, sitePath } = useMarketingSite();
  const query = useLinkGraphEdges(site.id, crawlId ?? null);

  const [layoutId, setLayoutId] = useState<LinkLayoutId>("fcose");
  const [colorMode, setColorMode] = useState<LinkColorMode>("depth");
  const [nodeCapId, setNodeCapId] = useState<NodeCapId>("standard");
  const [showExternal, setShowExternal] = useState(false);
  const [splitQueryVariants, setSplitQueryVariants] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Directory drill-down: which path the map shows. "/" = the whole site.
  const [focusPath, setFocusPath] = useState("/");
  // Sections (aggregated by URL folder) is the only readable default at scale;
  // page level is opt-in and only offered when the focus is small enough.
  const [pageLevel, setPageLevel] = useState(false);

  const nodeCap =
    NODE_CAPS.find((c) => c.id === nodeCapId)?.cap ?? NODE_CAPS[1].cap;

  const model = useMemo(
    () =>
      query.data
        ? buildLinkGraph(query.data.rows, site.root_url, {
            includeExternal: showExternal,
            splitQueryVariants,
            nodeCap,
          })
        : null,
    [query.data, site.root_url, showExternal, splitQueryVariants, nodeCap],
  );

  // Aggregate to the directory view at the current focus. This is what makes
  // the map readable: ~5-40 section nodes instead of 200-3,000 page nodes.
  const sectionModel = useMemo(
    () => (model ? buildSectionGraph(model, focusPath) : null),
    [model, focusPath],
  );

  // Page level is only honoured while the focus really is small.
  const showPages = pageLevel && Boolean(sectionModel?.pageLevelViable);

  // Page-level nodes are scoped to the focused folder, so drilling in and
  // switching to pages shows THAT folder's pages, not the whole site.
  const focusedPageNodes = useMemo(() => {
    if (!model) return [];
    if (focusPath === "/") return model.nodes;
    const prefix = `${focusPath}/`;
    return model.nodes.filter((node) => {
      if (node.external) return false;
      try {
        const path = new URL(node.fullUrl).pathname.replace(/\/+$/, "") || "/";
        return path === focusPath || path.startsWith(prefix);
      } catch {
        return false;
      }
    });
  }, [model, focusPath]);

  const focusedPageEdges = useMemo(() => {
    if (!model) return [];
    const ids = new Set(focusedPageNodes.map((node) => node.id));
    return model.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    );
  }, [model, focusedPageNodes]);

  // ONE canvas contract for both modes — colors/sizes/labels precomputed here.
  const canvas = useMemo(() => {
    if (showPages) {
      const maxInlinks = focusedPageNodes.reduce(
        (max, node) => Math.max(max, node.inlinks),
        0,
      );
      return {
        elements: focusedPageNodes.map((node) => ({
          id: node.id,
          label: node.label,
          color: nodeColor(node, colorMode),
          size: nodeSize(node.inlinks, maxInlinks),
          external: node.external,
          isRoot: node.isRoot,
          isFolder: false,
          importance: maxInlinks > 0 ? node.inlinks / maxInlinks : 0,
        })),
        edges: focusedPageEdges,
      };
    }
    const sections = sectionModel?.nodes ?? [];
    const maxPages = sections.reduce(
      (max, node) => Math.max(max, node.pageCount),
      0,
    );
    return {
      elements: sections.map((node) => ({
        id: node.id,
        label: node.label,
        color:
          node.kind === "external"
            ? LINK_EXTERNAL_COLOR
            : colorMode === "status" && node.brokenPages > 0
              ? LINK_STATUS_COLORS.broken
              : depthColor(node.depth),
        size: sectionSize(node.pageCount, maxPages),
        external: node.kind === "external",
        isRoot: node.kind === "index" && node.path === "/",
        isFolder: node.kind === "folder",
        importance: maxPages > 0 ? node.pageCount / maxPages : 0,
      })),
      edges: sectionModel?.edges ?? [],
    };
  }, [showPages, focusedPageNodes, focusedPageEdges, sectionModel, colorMode]);

  // At page level with many nodes, only hubs keep a standing label.
  const labelMinSize = showPages && canvas.elements.length > 25 ? 26 : 0;

  const selectedSection =
    sectionModel && selectedId && !showPages
      ? (sectionModel.nodes.find((node) => node.id === selectedId) ?? null)
      : null;

  const selected =
    model && selectedId && showPages
      ? (model.nodes.find((n) => n.id === selectedId) ?? null)
      : null;

  /** Click a folder → drill in. Click anything else → select it. */
  const handleNodeClick = (id: string) => {
    if (!showPages) {
      const node = sectionModel?.nodes.find((candidate) => candidate.id === id);
      if (node?.drillable) {
        setFocusPath(node.path);
        setSelectedId(null);
        return;
      }
    }
    setSelectedId(id);
  };

  const copy = model
    ? webCopy({
        kind: "web-link-graph",
        label: "Link graph",
        description:
          "Aggregated site link graph: unique pages with inlink/outlink counts, click depth from home, and weighted directed edges.",
        surface: crawlId
          ? `Crawl link graph — session ${crawlId}`
          : `Site link graph — ${site.root_url}`,
        data: {
          site_id: site.id,
          session_id: crawlId ?? null,
          stats: model.stats,
          nodes: model.nodes.slice(0, 100),
          edges: model.edges.slice(0, 300),
        },
        lines: [
          ["Internal pages", model.stats.internalPages],
          ["External targets", model.stats.externalTargets],
          ["Unique links", model.stats.uniqueEdges],
          ["Broken targets", model.stats.brokenTargets],
          ["Orphan pages", model.stats.orphanPages],
        ],
        attributes: { site_id: site.id, session_id: crawlId },
      })
    : null;

  if (query.isLoading) return <LoadingSurface label="Building link graph…" />;
  if (query.isError || !query.data || !model) {
    return (
      <QueryError error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  if (model.nodes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Link2Off className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          No link graph to draw yet
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          {showExternal
            ? "No links have been captured for this site."
            : "No internal links captured yet — external-only link profiles can be shown with the External toggle."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-2.5 py-2">
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a page…"
            className="h-8 w-44 rounded-md border border-border bg-background pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
            style={{ fontSize: 16 } as CSSProperties}
          />
        </div>
        <Select
          value={layoutId}
          onValueChange={(value) => setLayoutId(value as LinkLayoutId)}
        >
          <SelectTrigger className={SELECT_TRIGGER} title="Layout">
            <span style={TRIGGER_INNER}>
              <Network className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {LINK_LAYOUTS.map((layout) => (
              <SelectItem
                key={layout.id}
                value={layout.id}
                title={layout.description}
              >
                {layout.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={colorMode}
          onValueChange={(value) => setColorMode(value as LinkColorMode)}
        >
          <SelectTrigger className={SELECT_TRIGGER} title="Color by">
            <span style={TRIGGER_INNER}>
              <Palette className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="depth">Click depth</SelectItem>
            <SelectItem value="status">HTTP status</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={nodeCapId}
          onValueChange={(value) => setNodeCapId(value as NodeCapId)}
        >
          <SelectTrigger
            className="h-8 w-[120px] shrink-0 text-xs"
            title="Detail — how many pages to render"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {NODE_CAPS.map((cap) => (
              <SelectItem key={cap.id} value={cap.id}>
                {cap.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleChip
          active={showExternal}
          onClick={() => {
            setShowExternal((v) => !v);
            setSelectedId(null);
          }}
          icon={<Globe className="h-3.5 w-3.5" />}
          label="External"
          title="Include external link targets (diamonds)"
        />
        <ToggleChip
          active={splitQueryVariants}
          onClick={() => {
            setSplitQueryVariants((v) => !v);
            setSelectedId(null);
          }}
          icon={<SplitSquareHorizontal className="h-3.5 w-3.5" />}
          label="Split params"
          title="Treat each distinct query string as its own page (tracking params are always ignored)"
        />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
            {showPages
              ? `${canvas.elements.length.toLocaleString()} pages`
              : `${canvas.elements.length.toLocaleString()} sections · ${(sectionModel?.pagesInFocus ?? 0).toLocaleString()} pages`}{" "}
            · {canvas.edges.length.toLocaleString()} links
            {model.capped ? " · top pages shown" : ""}
            {query.data.truncated
              ? ` · newest ${query.data.rows.length.toLocaleString()} of ${query.data.total.toLocaleString()} rows`
              : ""}
          </span>
          {copy ? <CopyButtons size="icon" {...copy} /> : null}
        </div>
      </div>

      {/* Drill-down breadcrumb + aggregation level */}
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border px-3 py-1.5 text-[11px]">
        <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {sectionModel?.breadcrumb.map((crumb, index) => (
          <span key={crumb.path} className="flex shrink-0 items-center gap-1.5">
            {index > 0 ? (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            ) : null}
            <button
              type="button"
              onClick={() => {
                setFocusPath(crumb.path);
                setSelectedId(null);
              }}
              disabled={crumb.path === focusPath}
              className={cn(
                "rounded px-1 py-0.5 font-mono",
                crumb.path === focusPath
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {crumb.label}
            </button>
          </span>
        ))}
        <div className="ml-auto flex shrink-0 items-center rounded-md border border-border p-0.5">
          <button
            type="button"
            aria-pressed={!showPages}
            onClick={() => setPageLevel(false)}
            className={cn(
              "rounded px-2 py-0.5 font-medium transition-colors",
              !showPages
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Sections
          </button>
          <button
            type="button"
            aria-pressed={showPages}
            disabled={!sectionModel?.pageLevelViable}
            onClick={() => setPageLevel(true)}
            title={
              sectionModel?.pageLevelViable
                ? "Show every page in this section"
                : `Too many pages here to draw individually (${(sectionModel?.pagesInFocus ?? 0).toLocaleString()}) — drill into a section first`
            }
            className={cn(
              "rounded px-2 py-0.5 font-medium transition-colors",
              showPages
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
              !sectionModel?.pageLevelViable && "cursor-not-allowed opacity-40",
            )}
          >
            Pages
          </button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">
            {model.stats.internalPages.toLocaleString()}
          </span>{" "}
          internal pages
        </span>
        {onShowExternal ? (
          <button
            type="button"
            onClick={onShowExternal}
            className="tabular-nums underline-offset-2 hover:text-foreground hover:underline"
            title="Open the outbound-links report"
          >
            <span className="font-semibold text-foreground">
              {model.stats.externalTargets.toLocaleString()}
            </span>{" "}
            external targets
          </button>
        ) : (
          <span className="tabular-nums">
            <span className="font-semibold text-foreground">
              {model.stats.externalTargets.toLocaleString()}
            </span>{" "}
            external targets
          </span>
        )}
        <span className="tabular-nums">
          <span
            className={cn(
              "font-semibold",
              model.stats.brokenTargets > 0
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {model.stats.brokenTargets.toLocaleString()}
          </span>{" "}
          broken
        </span>
        <span className="tabular-nums">
          <span
            className={cn(
              "font-semibold",
              model.stats.orphanPages > 0
                ? "text-amber-600 dark:text-amber-400"
                : "text-foreground",
            )}
          >
            {model.stats.orphanPages.toLocaleString()}
          </span>{" "}
          orphans
        </span>
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">
            {model.stats.excludedLinks.toLocaleString()}
          </span>{" "}
          self/mailto excluded
        </span>
      </div>

      {/* Canvas + side panel */}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <LinkGraphCytoscape
            elements={canvas.elements}
            edges={canvas.edges}
            rootId={showPages ? model.rootId : focusPath}
            layoutId={layoutId}
            selectedId={selectedId}
            searchQuery={search}
            labelMinSize={labelMinSize}
            onNodeClick={handleNodeClick}
            onBackgroundClick={() => setSelectedId(null)}
          />
          <GraphLegend colorMode={colorMode} showExternal={showExternal} />
        </div>
        {selected ? (
          <NodePanel
            node={selected}
            model={model}
            rootUrl={site.root_url}
            sitePath={sitePath}
            onClose={() => setSelectedId(null)}
          />
        ) : selectedSection ? (
          <SectionPanel
            node={selectedSection}
            sitePath={sitePath}
            onDrillIn={() => {
              setFocusPath(selectedSection.path);
              setSelectedId(null);
            }}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
