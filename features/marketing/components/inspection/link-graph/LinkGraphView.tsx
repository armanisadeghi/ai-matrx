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
  ExternalLink,
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
  displayUrl,
  type LinkGraphModel,
  type LinkGraphNode,
} from "./model";
import {
  depthColor,
  LINK_DEPTH_LABELS,
  LINK_EXTERNAL_COLOR,
  LINK_STATUS_COLORS,
  LINK_STATUS_LABELS,
  LINK_UNREACHED_COLOR,
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

export function LinkGraphView({ crawlId }: { crawlId?: string }) {
  const { site, sitePath } = useMarketingSite();
  const query = useLinkGraphEdges(site.id, crawlId ?? null);

  const [layoutId, setLayoutId] = useState<LinkLayoutId>("fcose");
  const [colorMode, setColorMode] = useState<LinkColorMode>("depth");
  const [nodeCapId, setNodeCapId] = useState<NodeCapId>("standard");
  const [showExternal, setShowExternal] = useState(false);
  const [splitQueryVariants, setSplitQueryVariants] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected =
    model && selectedId
      ? (model.nodes.find((n) => n.id === selectedId) ?? null)
      : null;

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
            {model.nodes.length.toLocaleString()} pages ·{" "}
            {model.edges.length.toLocaleString()} links
            {model.capped ? " · top pages shown" : ""}
            {query.data.truncated
              ? ` · newest ${query.data.rows.length.toLocaleString()} of ${query.data.total.toLocaleString()} rows`
              : ""}
          </span>
          {copy ? <CopyButtons size="icon" {...copy} /> : null}
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
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">
            {model.stats.externalTargets.toLocaleString()}
          </span>{" "}
          external targets
        </span>
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
            nodes={model.nodes}
            edges={model.edges}
            rootId={model.rootId}
            colorMode={colorMode}
            layoutId={layoutId}
            selectedId={selectedId}
            searchQuery={search}
            onNodeClick={setSelectedId}
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
        ) : null}
      </div>
    </div>
  );
}
