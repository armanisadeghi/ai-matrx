// components/official/org-chart/OrgChart.tsx
//
// THE org chart. One component for every hierarchy the platform draws: it takes
// a forest of typed nodes and renders it as a pannable, zoomable tree whose
// links are coloured by kind, with a legend saying what each colour means.
// The caller owns the cards (renderCard) and the meaning of each link kind;
// this owns layout, navigation and chrome.
//
// Reference: Paperclip's org chart (github.com/paperclipai/paperclip, MIT —
// layout credit in ./layout.ts). Matched: tidy top-down tree, elbow connectors,
// drag to pan, zoom toward the pointer, pinch, zoom buttons, fit to screen,
// clickable cards. Beyond it: collapse/expand with hidden-count badges, stacked
// two-column teams, links coloured by kind with a legend, search that reveals
// and centres a match, a minimap, trackpad-native scroll-to-pan, keyboard
// control, and cards that glide when the tree reshapes.

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Map as MapIcon,
  Maximize2,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ORG_CHART_LAYOUT,
  ancestorKeys,
  collectParentKeys,
  layoutOrgForest,
  type OrgChartTreeNode,
  type PlacedOrgNode,
} from "./layout";
import { usePanZoom } from "./usePanZoom";

export interface OrgChartEdgeKind {
  label: string;
  /** One sentence for the legend: what this kind of link means. */
  description?: string;
  /** Any CSS colour — use a semantic token, e.g. `hsl(var(--primary))`. */
  color: string;
  dashed?: boolean;
}

export interface OrgChartCardState {
  selected: boolean;
  /** Matches the current search. */
  matched: boolean;
  /** Make this card the selected one (its links highlight). */
  select: () => void;
}

export interface OrgChartProps<T> {
  roots: OrgChartTreeNode<T>[];
  edgeKinds: Record<string, OrgChartEdgeKind>;
  renderCard: (node: PlacedOrgNode<T>, state: OrgChartCardState) => ReactNode;
  /** Text a search matches against. Omit to hide search. */
  getSearchText?: (data: T) => string;
  selectedKey?: string | null;
  onSelect?: (key: string | null) => void;
  /** Nodes at this depth or deeper start collapsed. Omit to start fully open. */
  collapseFromDepth?: number;
  cardWidth?: number;
  cardHeight?: number;
  /** Extra controls rendered at the left of the top bar. */
  toolbar?: ReactNode;
  /** Shown instead of the canvas when `roots` is empty. */
  emptyState?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

const UNKNOWN_EDGE: OrgChartEdgeKind = { label: "Link", color: "hsl(var(--border))" };

function initialCollapsed<T>(roots: OrgChartTreeNode<T>[], fromDepth?: number): Set<string> {
  const out = new Set<string>();
  if (fromDepth === undefined) return out;
  const walk = (n: OrgChartTreeNode<T>, d: number) => {
    if (d >= fromDepth && n.children.length) out.add(n.key);
    n.children.forEach((c) => walk(c, d + 1));
  };
  roots.forEach((r) => walk(r, 0));
  return out;
}

function ControlButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function OrgChart<T>({
  roots,
  edgeKinds,
  renderCard,
  getSearchText,
  selectedKey: selectedKeyProp = null,
  onSelect: onSelectProp,
  collapseFromDepth,
  cardWidth = DEFAULT_ORG_CHART_LAYOUT.cardWidth,
  cardHeight = DEFAULT_ORG_CHART_LAYOUT.cardHeight,
  toolbar,
  emptyState,
  ariaLabel = "Org chart",
  className,
}: OrgChartProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    initialCollapsed(roots, collapseFromDepth),
  );
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [showMinimap, setShowMinimap] = useState(true);
  const { view, viewport, touched, smooth, fitTo, centerOn, zoomBy, panBy, handlers } = usePanZoom(viewportRef);
  // Controlled when the caller passes onSelect; otherwise the chart keeps its own.
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const selectedKey = onSelectProp ? selectedKeyProp : ownSelected;
  const onSelect = onSelectProp ?? setOwnSelected;

  const layout = layoutOrgForest(roots, {
    ...DEFAULT_ORG_CHART_LAYOUT,
    cardWidth,
    cardHeight,
    collapsed,
    targetAspect: viewport.w > 0 && viewport.h > 0 ? viewport.w / viewport.h : undefined,
  });

  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));

  // Search runs over the WHOLE forest, hidden nodes included — a match inside a
  // collapsed team is revealed, not missed.
  const matches: string[] = [];
  const q = query.trim().toLowerCase();
  if (q && getSearchText) {
    const walk = (n: OrgChartTreeNode<T>) => {
      if (getSearchText(n.data).toLowerCase().includes(q)) matches.push(n.key);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
  }
  const matchSet = new Set(matches);

  // Keep the whole chart framed as it grows (data arrives level by level) until
  // the person moves the view themselves; from then on it is theirs.
  const framedSize = useRef("");
  const sizeKey = `${layout.width}x${layout.height}@${viewport.w}x${viewport.h}`;
  useEffect(() => {
    if (touched || layout.nodes.length === 0 || framedSize.current === sizeKey) return;
    if (fitTo({ x: 0, y: 0, width: layout.width, height: layout.height })) framedSize.current = sizeKey;
  }, [sizeKey, touched, layout.nodes.length, layout.width, layout.height, fitTo]);

  const fitAll = () => fitTo({ x: 0, y: 0, width: layout.width, height: layout.height });

  const reveal = (key: string) => {
    const path = ancestorKeys(roots, key);
    if (path?.some((k) => collapsed.has(k))) {
      setCollapsed((prev) => {
        const next = new Set(prev);
        path.forEach((k) => next.delete(k));
        return next;
      });
    }
    onSelect(key);
  };

  // Centre the selected node once it exists in the (possibly re-expanded) layout.
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const n = byKey.get(key);
    if (!n) return;
    pendingFocus.current = null;
    centerOn(n.x + cardWidth / 2, n.y + cardHeight / 2, Math.max(view.zoom, 0.8));
  }, [byKey, centerOn, cardWidth, cardHeight, view.zoom]);

  const goToMatch = (i: number) => {
    if (matches.length === 0) return;
    const idx = ((i % matches.length) + matches.length) % matches.length;
    setMatchIndex(idx);
    pendingFocus.current = matches[idx];
    reveal(matches[idx]);
  };

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys from a card's portaled menu or dialog bubble here through React;
    // only keys pressed on the chart itself steer it.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest("input, [role=menu], [role=dialog]")) return;
    const step = 80;
    switch (e.key) {
      case "+":
      case "=":
        zoomBy(1.2);
        break;
      case "-":
      case "_":
        zoomBy(1 / 1.2);
        break;
      case "0":
        fitAll();
        break;
      case "ArrowLeft":
        panBy(step, 0);
        break;
      case "ArrowRight":
        panBy(-step, 0);
        break;
      case "ArrowUp":
        panBy(0, step);
        break;
      case "ArrowDown":
        panBy(0, -step);
        break;
      case "Escape":
        onSelect(null);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const usedKinds = new Set(layout.edges.map((e) => e.kind ?? ""));
  const kindsInUse = Object.entries(edgeKinds).filter(([k]) => usedKinds.has(k));

  if (roots.length === 0) {
    return <div className={cn("flex h-full w-full", className)}>{emptyState}</div>;
  }

  const glide = "transition-transform duration-300 ease-out";

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col", className)}>
      <div
        ref={viewportRef}
        role="application"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
        {...handlers}
        className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden bg-textured outline-none active:cursor-grabbing"
        style={{ overscrollBehavior: "contain" }}
      >
        {/* Dot grid that moves with the world. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: "radial-gradient(hsl(var(--border)) 1px, transparent 1px)",
            backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
        />

        <div
          className={cn("absolute left-0 top-0 origin-top-left will-change-transform", smooth && glide)}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
        >
          <svg
            className="pointer-events-none absolute left-0 top-0 overflow-visible"
            width={layout.width}
            height={layout.height}
          >
            {layout.edges.map((e) => {
              const kind = edgeKinds[e.kind ?? ""] ?? UNKNOWN_EDGE;
              const hot = selectedKey !== null && (e.fromKey === selectedKey || e.toKey === selectedKey);
              return (
                <path
                  key={e.key}
                  d={e.d}
                  fill="none"
                  stroke={kind.color}
                  strokeWidth={hot ? 3 : 2}
                  strokeDasharray={kind.dashed ? "7 6" : undefined}
                  strokeLinecap="round"
                  opacity={selectedKey && !hot ? 0.55 : 0.95}
                  style={{ transition: "d 300ms ease-out, opacity 150ms" }}
                />
              );
            })}
          </svg>

          {layout.nodes.map((n) => {
            const selected = n.key === selectedKey;
            return (
              <div
                key={n.key}
                className={cn("absolute left-0 top-0", glide)}
                style={{
                  transform: `translate(${n.x}px, ${n.y}px)`,
                  width: cardWidth,
                  height: cardHeight,
                }}
              >
                {renderCard(n, { selected, matched: matchSet.has(n.key), select: () => onSelect(n.key) })}
                {n.childCount > 0 && (
                  <button
                    type="button"
                    onClick={() => toggle(n.key)}
                    title={n.collapsed ? `Show ${n.descendantCount} below` : "Collapse"}
                    aria-label={n.collapsed ? `Show ${n.descendantCount} below` : "Collapse"}
                    aria-expanded={!n.collapsed}
                    className={cn(
                      "absolute left-1/2 top-full z-10 flex h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-0.5 rounded-full border border-border bg-card px-2 text-[11px] font-semibold text-muted-foreground shadow-sm transition-colors hover:border-foreground/30 hover:text-foreground",
                      n.collapsed && "text-foreground",
                    )}
                  >
                    {n.collapsed ? (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        {n.descendantCount}
                      </>
                    ) : (
                      <ChevronUp className="h-3 w-3" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Top bar: caller's controls + search (left), view controls (right). */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-2" data-no-pan>
            {toolbar}
            {getSearchText && (
              <div className="flex h-9 items-center gap-1 rounded-lg border border-border bg-card/95 pl-2.5 pr-1 shadow-sm backdrop-blur">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setMatchIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      // First Enter jumps to the current match; each next one steps on.
                      const onCurrent = selectedKey === matches[matchIndex];
                      const step = onCurrent ? (e.shiftKey ? -1 : 1) : 0;
                      goToMatch(matchIndex + step);
                    }
                    if (e.key === "Escape") setQuery("");
                  }}
                  placeholder="Find in chart"
                  aria-label="Find in chart"
                  className="w-32 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:w-40 sm:text-sm"
                />
                {query && (
                  <>
                    <span className="whitespace-nowrap px-1 text-[11px] tabular-nums text-muted-foreground">
                      {matches.length ? `${matchIndex + 1}/${matches.length}` : "0"}
                    </span>
                    <ControlButton label="Next match" onClick={() => goToMatch(matchIndex + 1)}>
                      <ChevronDown className="h-3.5 w-3.5" />
                    </ControlButton>
                    <ControlButton label="Clear search" onClick={() => setQuery("")}>
                      <X className="h-3.5 w-3.5" />
                    </ControlButton>
                  </>
                )}
              </div>
            )}
          </div>

          <div
            className="pointer-events-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card/95 p-0.5 shadow-sm backdrop-blur"
            data-no-pan
          >
            <ControlButton label="Zoom out" onClick={() => zoomBy(1 / 1.2)}>
              <Minus className="h-4 w-4" />
            </ControlButton>
            <span className="w-11 text-center text-[11px] tabular-nums text-muted-foreground">
              {Math.round(view.zoom * 100)}%
            </span>
            <ControlButton label="Zoom in" onClick={() => zoomBy(1.2)}>
              <Plus className="h-4 w-4" />
            </ControlButton>
            <ControlButton label="Fit to screen" onClick={fitAll}>
              <Maximize2 className="h-3.5 w-3.5" />
            </ControlButton>
            <span className="mx-0.5 h-5 w-px bg-border" />
            <ControlButton label="Expand all" onClick={() => setCollapsed(new Set())}>
              <ChevronsUpDown className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              label="Collapse all"
              onClick={() => setCollapsed(new Set(collectParentKeys(roots)))}
            >
              <ChevronsDownUp className="h-4 w-4" />
            </ControlButton>
            <ControlButton label="Minimap" active={showMinimap} onClick={() => setShowMinimap((v) => !v)}>
              <MapIcon className="h-3.5 w-3.5" />
            </ControlButton>
          </div>
        </div>

        {kindsInUse.length > 0 && (
          <div
            className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur sm:max-w-xs"
            data-no-pan
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Links
            </div>
            <ul className="space-y-1.5">
              {kindsInUse.map(([k, kind]) => (
                <li key={k} className="flex items-start gap-2">
                  <svg width="28" height="10" className="mt-1 shrink-0" aria-hidden>
                    <line
                      x1="1"
                      y1="5"
                      x2="27"
                      y2="5"
                      stroke={kind.color}
                      strokeWidth={2.5}
                      strokeDasharray={kind.dashed ? "5 4" : undefined}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground">{kind.label}</div>
                    {kind.description && (
                      <div className="text-[11px] leading-snug text-muted-foreground">{kind.description}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showMinimap && (
          <Minimap
            layout={layout}
            cardWidth={cardWidth}
            cardHeight={cardHeight}
            view={view}
            viewport={viewport}
            selectedKey={selectedKey}
            onJump={(wx, wy) => centerOn(wx, wy)}
          />
        )}
      </div>
    </div>
  );
}

function Minimap<T>({
  layout,
  cardWidth,
  cardHeight,
  view,
  viewport,
  selectedKey,
  onJump,
}: {
  layout: { nodes: PlacedOrgNode<T>[]; width: number; height: number };
  cardWidth: number;
  cardHeight: number;
  view: { x: number; y: number; zoom: number };
  viewport: { w: number; h: number };
  selectedKey: string | null;
  onJump: (wx: number, wy: number) => void;
}) {
  const MAX_W = 180;
  const MAX_H = 120;
  if (layout.width <= 0 || layout.height <= 0) return null;
  const scale = Math.min(MAX_W / layout.width, MAX_H / layout.height);
  const w = layout.width * scale;
  const h = layout.height * scale;
  const vw = viewport.w;
  const vh = viewport.h;
  // Visible world rectangle.
  const rx = (-view.x / view.zoom) * scale;
  const ry = (-view.y / view.zoom) * scale;
  const rw = (vw / view.zoom) * scale;
  const rh = (vh / view.zoom) * scale;
  return (
    <div
      className="absolute bottom-3 right-3 z-20 hidden rounded-lg border border-border bg-card/95 p-1.5 shadow-sm backdrop-blur sm:block"
      data-no-pan
    >
      <svg
        width={w}
        height={h}
        className="cursor-pointer overflow-hidden"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          onJump((e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale);
        }}
        aria-label="Minimap — click to move there"
        role="img"
      >
        {layout.nodes.map((n) => (
          <rect
            key={n.key}
            x={n.x * scale}
            y={n.y * scale}
            width={Math.max(cardWidth * scale, 2)}
            height={Math.max(cardHeight * scale, 1.5)}
            rx={1}
            fill={n.key === selectedKey ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.45)"}
          />
        ))}
        <rect
          x={rx}
          y={ry}
          width={rw}
          height={rh}
          fill="hsl(var(--primary) / 0.08)"
          stroke="hsl(var(--primary))"
          strokeWidth={1}
          rx={2}
        />
      </svg>
    </div>
  );
}
