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
  FileDown,
  ImageDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { exportChart, type ChartExportFormat } from "./exportChart";
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
  /**
   * Select this card. `additive` (shift / ⌘ / Ctrl click) adds or removes it
   * from the selection instead of replacing it.
   */
  select: (opts?: { additive?: boolean }) => void;
  /** A drag is hovering this card: would it accept the drop? */
  dropTarget: "accept" | "refuse" | null;
  /** This card is part of the drag in progress. */
  dragging: boolean;
}

/** A link drawn as an arrow ACROSS the tree (it does not place a box). */
export interface OrgChartCrossLink {
  key: string;
  fromKey: string;
  toKey: string;
  kind: string;
}

export interface OrgChartProps<T> {
  roots: OrgChartTreeNode<T>[];
  edgeKinds: Record<string, OrgChartEdgeKind>;
  renderCard: (node: PlacedOrgNode<T>, state: OrgChartCardState) => ReactNode;
  /** Text a search matches against. Omit to hide search. */
  getSearchText?: (data: T) => string;
  /** Controlled selection (keys). Omit to let the chart keep its own. */
  selection?: readonly string[];
  onSelectionChange?: (keys: string[]) => void;
  /** Arrows over the tree, e.g. hand-offs. An end hidden in a collapsed team attaches to its nearest visible ancestor. */
  crossLinks?: readonly OrgChartCrossLink[];
  /**
   * Turns on drag-and-drop: drag one card (or the selection) onto another.
   * `targetKey` is null when dropped on empty canvas. `point` is in client px.
   */
  onDrop?: (dragKeys: string[], targetKey: string | null, point: { x: number; y: number }) => void;
  /** Would `targetKey` accept these? A refused target shows red and drops nothing. */
  canDrop?: (dragKeys: string[], targetKey: string) => boolean;
  /** Short name of a card for the drag chip. */
  dragLabel?: (data: T) => string;
  /** Shows a "+" under every card. */
  onAddBelow?: (key: string) => void;
  /** Enter on the selected card. */
  onOpen?: (key: string) => void;
  /** Delete / Backspace with cards selected. */
  onDelete?: (keys: string[]) => void;
  /** Reveal, select and centre this card whenever the value changes (deep links). */
  focusKey?: string | null;
  /** Remembers collapsed teams and the minimap toggle in this browser under this name. */
  persistKey?: string;
  /** Nodes at this depth or deeper start collapsed. Omit to start fully open. */
  collapseFromDepth?: number;
  cardWidth?: number;
  cardHeight?: number;
  /** Name for downloads (PNG / PDF of the whole chart). Omit to hide the download buttons. */
  exportTitle?: string;
  /** Extra controls rendered at the left of the top bar. */
  toolbar?: ReactNode;
  /**
   * Point at a set of cards (a health issue, a filter): they read as matches,
   * everything else dims, and the bar steps through them like search results.
   */
  highlight?: { keys: readonly string[]; label: string; onClear: () => void } | null;
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
  selection: selectionProp,
  onSelectionChange,
  crossLinks = [],
  onDrop,
  canDrop,
  dragLabel,
  onAddBelow,
  onOpen,
  onDelete,
  focusKey = null,
  persistKey,
  collapseFromDepth,
  cardWidth = DEFAULT_ORG_CHART_LAYOUT.cardWidth,
  cardHeight = DEFAULT_ORG_CHART_LAYOUT.cardHeight,
  toolbar,
  highlight,
  exportTitle,
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
  const { view, viewport, touched, smooth, fitTo, centerOn, zoomBy, panBy, handlers, cancelGesture } =
    usePanZoom(viewportRef);
  // Controlled when the caller passes onSelectionChange; otherwise the chart keeps its own.
  const [ownSelection, setOwnSelection] = useState<string[]>([]);
  const selection = onSelectionChange ? (selectionProp ?? []) : ownSelection;
  const setSelection = onSelectionChange ?? setOwnSelection;
  const selectedSet = new Set(selection);
  /** The card keyboard moves from: the last one selected. */
  const selectedKey = selection.length ? selection[selection.length - 1] : null;
  const onSelect = (key: string | null) => setSelection(key ? [key] : []);
  const selectCard = (key: string, additive?: boolean) => {
    if (!additive) return setSelection([key]);
    setSelection(selectedSet.has(key) ? selection.filter((k) => k !== key) : [...selection, key]);
  };

  // ── remembered view (per browser; a convenience, never state that matters) ──
  const storageKey = persistKey ? `matrx:org-chart:${persistKey}` : null;
  // The key whose saved view has been read: a new key (another chart in the same
  // mounted component) reads ITS view before anything is written under it.
  const loadedPersist = useRef<string | null>(null);
  const skipNextWrite = useRef(false);
  useEffect(() => {
    if (!storageKey) {
      loadedPersist.current = null; // coming back to a key reads it again
      return;
    }
    if (loadedPersist.current === storageKey) return;
    loadedPersist.current = storageKey;
    skipNextWrite.current = true; // this pass still holds the previous view
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) {
        setCollapsed(new Set());
        setShowMinimap(true);
        return;
      }
      const saved = JSON.parse(raw) as { collapsed?: unknown; minimap?: unknown };
      if (Array.isArray(saved.collapsed)) {
        setCollapsed(new Set(saved.collapsed.filter((k): k is string => typeof k === "string")));
      }
      if (typeof saved.minimap === "boolean") setShowMinimap(saved.minimap);
    } catch {
      // Storage unavailable (private window, blocked site data): start fresh.
    }
  }, [storageKey]);
  const collapsedKey = [...collapsed].sort().join("|");
  useEffect(() => {
    if (!storageKey || loadedPersist.current !== storageKey) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ collapsed: collapsedKey ? collapsedKey.split("|") : [], minimap: showMinimap }),
      );
    } catch {
      // Storage unavailable: the view simply isn't remembered.
    }
  }, [storageKey, collapsedKey, showMinimap]);

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
  const highlightSet = highlight ? new Set(highlight.keys) : null;
  if (highlightSet && !q) {
    const walk = (n: OrgChartTreeNode<T>) => {
      if (highlightSet.has(n.key)) matches.push(n.key);
      n.children.forEach(walk);
    };
    roots.forEach(walk);
  } else if (q && getSearchText) {
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

  // A new highlight starts at its first card.
  const highlightLabel = highlight?.label ?? null;
  useEffect(() => {
    if (highlightLabel) setMatchIndex(0);
  }, [highlightLabel]);

  const worldRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const download = async (format: ChartExportFormat) => {
    if (!worldRef.current || !exportTitle || exporting) return;
    setExporting(true);
    try {
      await exportChart(worldRef.current, { width: layout.width, height: layout.height }, { title: exportTitle, format });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The chart could not be downloaded.");
    } finally {
      setExporting(false);
    }
  };

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

  // Deep link / outside request: reveal, select and centre a card.
  const lastFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey || lastFocus.current === focusKey) return;
    if (!ancestorKeys(roots, focusKey)) return; // not in the chart (yet) — try again when it loads
    lastFocus.current = focusKey;
    pendingFocus.current = focusKey;
    reveal(focusKey);
  });

  /** Keep the keyboard's card on screen. */
  const ensureVisible = (key: string) => {
    const n = byKey.get(key);
    if (!n) return;
    const sx = n.x * view.zoom + view.x;
    const sy = n.y * view.zoom + view.y;
    const margin = 40;
    if (
      sx < margin ||
      sy < margin ||
      sx + cardWidth * view.zoom > viewport.w - margin ||
      sy + cardHeight * view.zoom > viewport.h - margin
    ) {
      centerOn(n.x + cardWidth / 2, n.y + cardHeight / 2);
    }
  };

  /** Arrow-key neighbour of the selected card in the visible tree. */
  const neighbour = (key: string, dir: "up" | "down" | "left" | "right"): string | null => {
    const n = byKey.get(key);
    if (!n) return null;
    if (dir === "up") return n.parentKey;
    if (dir === "down") {
      if (n.collapsed) {
        toggle(key);
        return null;
      }
      return layout.nodes.find((c) => c.parentKey === key)?.key ?? null;
    }
    const siblings = layout.nodes.filter((c) => c.parentKey === n.parentKey);
    const i = siblings.findIndex((c) => c.key === key);
    const j = dir === "left" ? i - 1 : i + 1;
    return siblings[j]?.key ?? null;
  };

  // ── drag and drop ────────────────────────────────────────────────────────
  const [drag, setDrag] = useState<{
    keys: string[];
    x: number;
    y: number;
    /** Where it was picked up. */
    ox: number;
    oy: number;
    target: string | null;
    accept: boolean;
    /** Carried past the slop since it was picked up — a hold and release is not a drop. */
    moved: boolean;
  } | null>(null);
  const dragRef = useRef<{
    key: string;
    startX: number;
    startY: number;
    pointerType: string;
    active: boolean;
    timer: number | null;
  } | null>(null);
  const swallowClick = useRef(false);
  /** Set while we cancel the card's own long-press; that synthetic cancel is not ours to act on. */
  const ignoreCancel = useRef(false);
  /** Detaches a press's window listeners; run on unmount so a mid-drag unmount leaves none behind. */
  const stopDrag = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stopDrag.current?.();
      liveDrag.current = null;
    },
    [],
  );
  /** The drag as the pointer handlers see it (state is for rendering only). */
  const liveDrag = useRef<typeof drag>(null);

  /**
   * What a release at this point means. Only open canvas inside the chart is a
   * "drop on nothing" — over the carried card itself, over chart chrome (toolbar,
   * legend, minimap, menus) or outside the chart, the drag is called off.
   */
  const dropAt = (
    clientX: number,
    clientY: number,
    keys: string[],
  ): { kind: "card"; key: string } | { kind: "canvas" } | { kind: "cancel" } => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return { kind: "cancel" };
    }
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      const h = el as HTMLElement;
      if (h === viewportRef.current) return { kind: "canvas" };
      const key = h.closest?.("[data-org-key]")?.getAttribute("data-org-key");
      if (key) return keys.includes(key) ? { kind: "cancel" } : { kind: "card", key };
      if (h.closest?.("[data-no-pan]")) return { kind: "cancel" };
      if (!viewportRef.current?.contains(h)) return { kind: "cancel" }; // something laid over the chart
    }
    return { kind: "cancel" };
  };

  const beginDrag = (key: string, clientX: number, clientY: number) => {
    const keys = selectedSet.has(key) ? selection.slice() : [key];
    if (!selectedSet.has(key)) setSelection([key]);
    liveDrag.current = { keys, x: clientX, y: clientY, ox: clientX, oy: clientY, target: null, accept: false, moved: false };
    setDrag(liveDrag.current);
  };

  const onCardPointerDown = (key: string) => (e: React.PointerEvent) => {
    if (!onDrop) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button, a, input, textarea, select, [data-no-drag]")) return;
    const start = { key, startX: e.clientX, startY: e.clientY, pointerType: e.pointerType, active: false, timer: null as number | null };
    // The element under the finger: the card's menu trigger sits between it and
    // this wrapper, so a cancel sent from here bubbles through the trigger.
    const pressed = e.target as HTMLElement | null;
    const pointerId = e.pointerId;
    if (e.pointerType === "touch") {
      // A finger pans the canvas; holding still on a card for a moment picks it up instead.
      start.timer = window.setTimeout(() => {
        const d = dragRef.current;
        if (!d || d.active) return;
        d.active = true;
        cancelGesture();
        // The card's context menu opens on its own long-press (~700ms); a synthetic
        // cancel ends that timer. Our own window listener ignores it.
        ignoreCancel.current = true;
        pressed?.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId, pointerType: "touch" }));
        ignoreCancel.current = false;
        beginDrag(d.key, d.startX, d.startY);
      }, 450);
    } else {
      e.stopPropagation(); // a mouse drag on a card moves the card, not the canvas
    }
    dragRef.current = start;

    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dist = Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY);
      if (!d.active) {
        if (d.pointerType === "touch") {
          if (dist > 8 && d.timer) {
            window.clearTimeout(d.timer); // it's a pan, not a hold
            cleanup();
          }
          return;
        }
        if (dist < 5) return;
        d.active = true;
        beginDrag(d.key, ev.clientX, ev.clientY);
      }
      ev.preventDefault();
      const cur = liveDrag.current;
      if (!cur) return;
      const at = dropAt(ev.clientX, ev.clientY, cur.keys);
      const target = at.kind === "card" ? at.key : null;
      const accept = target ? (canDrop ? canDrop(cur.keys, target) : true) : at.kind === "canvas";
      const moved = cur.moved || Math.hypot(ev.clientX - cur.ox, ev.clientY - cur.oy) > 4;
      liveDrag.current = { ...cur, x: ev.clientX, y: ev.clientY, target, accept, moved };
      setDrag(liveDrag.current);
      // Nudge the canvas when the card is carried to an edge.
      const rect = viewportRef.current?.getBoundingClientRect();
      if (rect) {
        const edge = 36;
        const dx = ev.clientX < rect.left + edge ? 14 : ev.clientX > rect.right - edge ? -14 : 0;
        const dy = ev.clientY < rect.top + edge ? 14 : ev.clientY > rect.bottom - edge ? -14 : 0;
        if (dx || dy) panBy(dx, dy);
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.type === "pointercancel" && ignoreCancel.current) return;
      cleanup();
      // Whatever happened in between, a release always ends a drag in progress.
      if (!liveDrag.current) return;
      swallowClick.current = true;
      window.setTimeout(() => (swallowClick.current = false), 0);
      const cur = liveDrag.current;
      liveDrag.current = null;
      setDrag(null);
      // A cancelled pointer, a hold with no carry, or a release that isn't a drop
      // place (the card itself, chrome, outside the chart) changes nothing.
      if (!cur || ev.type === "pointercancel" || !cur.moved) return;
      const at = dropAt(ev.clientX, ev.clientY, cur.keys);
      if (at.kind === "cancel") return;
      if (at.kind === "card") {
        if (canDrop && !canDrop(cur.keys, at.key)) return;
        onDrop(cur.keys, at.key, { x: ev.clientX, y: ev.clientY });
      } else {
        onDrop(cur.keys, null, { x: ev.clientX, y: ev.clientY });
      }
    };
    const key_ = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") {
        cleanup();
        liveDrag.current = null;
        setDrag(null);
      }
    };
    const noMenu = (ev: Event) => {
      if (liveDrag.current) ev.preventDefault(); // a held card is being carried, not asking for its menu
    };
    const cleanup = () => {
      const d = dragRef.current;
      if (d?.timer) window.clearTimeout(d.timer);
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", key_);
      window.removeEventListener("blur", cancelOnBlur);
      window.removeEventListener("contextmenu", noMenu, true);
      stopDrag.current = null;
    };
    stopDrag.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", key_);
    window.addEventListener("blur", cancelOnBlur);
    window.addEventListener("contextmenu", noMenu, true);
  };
  /** The window lost focus mid-drag (alt-tab, a system dialog): drop nothing. */
  const cancelOnBlur = () => {
    if (!liveDrag.current) return;
    liveDrag.current = null;
    setDrag(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Keys from a card's portaled menu or dialog bubble here through React;
    // only keys pressed on the chart itself steer it.
    if (!e.currentTarget.contains(e.target as Node)) return;
    if ((e.target as HTMLElement).closest("input, [role=menu], [role=dialog]")) return;
    const step = 80;
    const arrow = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" } as const;
    if (selectedKey && e.key in arrow && !e.metaKey && !e.ctrlKey) {
      const next = neighbour(selectedKey, arrow[e.key as keyof typeof arrow]);
      if (next) {
        setSelection([next]);
        ensureVisible(next);
      }
      e.preventDefault();
      return;
    }
    if (selectedKey && e.key === "Enter" && onOpen) {
      onOpen(selectedKey);
      e.preventDefault();
      return;
    }
    if (selection.length && (e.key === "Delete" || e.key === "Backspace") && onDelete) {
      onDelete(selection.slice());
      e.preventDefault();
      return;
    }
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

  // Cross links: an end hidden inside a collapsed team attaches to the nearest
  // visible ancestor, so a hand-off never silently disappears.
  const visibleEnd = (key: string): string | null => {
    if (byKey.has(key)) return key;
    const path = ancestorKeys(roots, key);
    if (!path) return null;
    for (let i = path.length - 1; i >= 0; i--) if (byKey.has(path[i])) return path[i];
    return null;
  };
  const drawnCross = crossLinks
    .map((l) => {
      const from = visibleEnd(l.fromKey);
      const to = visibleEnd(l.toKey);
      if (!from || !to || from === to) return null;
      const a = byKey.get(from)!;
      const b = byKey.get(to)!;
      return { ...l, d: crossLinkPath(a, b, cardWidth, cardHeight), from, to };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const usedKinds = new Set([...layout.edges.map((e) => e.kind ?? ""), ...drawnCross.map((l) => l.kind)]);
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

        {/* The world layer has the chart's real size and opts out of the phone
            `* { max-width: 100% }` default (globals.css): with a 0px-wide parent
            that default collapsed every card to a sliver on screens ≤768px. */}
        <div
          ref={worldRef}
          className={cn("absolute left-0 top-0 max-w-none origin-top-left will-change-transform", smooth && glide)}
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
          }}
        >
          <svg
            className="pointer-events-none absolute left-0 top-0 max-w-none overflow-visible"
            width={layout.width}
            height={layout.height}
          >
            <defs>
              {Object.entries(edgeKinds).map(([k, kind]) => (
                <marker
                  key={k}
                  id={`oc-arrow-${k}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill={kind.color} />
                </marker>
              ))}
            </defs>
            {layout.edges.map((e) => {
              const kind = edgeKinds[e.kind ?? ""] ?? UNKNOWN_EDGE;
              const hot = selectedKey !== null && (selectedSet.has(e.fromKey) || selectedSet.has(e.toKey));
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
            {drawnCross.map((l) => {
              const kind = edgeKinds[l.kind] ?? UNKNOWN_EDGE;
              const hot = selectedSet.has(l.from) || selectedSet.has(l.to);
              return (
                <path
                  key={l.key}
                  d={l.d}
                  fill="none"
                  stroke={kind.color}
                  strokeWidth={hot ? 2.75 : 1.75}
                  strokeDasharray={kind.dashed ? "4 5" : undefined}
                  strokeLinecap="round"
                  markerEnd={`url(#oc-arrow-${l.kind})`}
                  opacity={selectedKey && !hot ? 0.35 : 0.85}
                  style={{ transition: "d 300ms ease-out, opacity 150ms" }}
                />
              );
            })}
          </svg>

          {layout.nodes.map((n) => {
            const selected = selectedSet.has(n.key);
            const isTarget = drag?.target === n.key;
            return (
              <div
                key={n.key}
                data-org-key={n.key}
                onPointerDown={onCardPointerDown(n.key)}
                onClickCapture={(e) => {
                  if (!swallowClick.current) return;
                  swallowClick.current = false;
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className={cn(
                  "group/oc absolute left-0 top-0 max-w-none",
                  glide,
                  drag?.keys.includes(n.key) && "opacity-40",
                  highlightSet && !q && !matchSet.has(n.key) && "opacity-35",
                )}
                style={{
                  transform: `translate(${n.x}px, ${n.y}px)`,
                  width: cardWidth,
                  height: cardHeight,
                }}
              >
                {renderCard(n, {
                  selected,
                  matched: matchSet.has(n.key),
                  select: (opts) => selectCard(n.key, opts?.additive),
                  dropTarget: isTarget ? (drag?.accept ? "accept" : "refuse") : null,
                  dragging: Boolean(drag?.keys.includes(n.key)),
                })}
                {isTarget && (
                  <span
                    aria-hidden
                    className={cn(
                      "pointer-events-none absolute -inset-1.5 rounded-2xl border-2 border-dashed",
                      drag?.accept ? "border-primary bg-primary/5" : "border-destructive bg-destructive/5",
                    )}
                  />
                )}
                {onAddBelow && !drag && (
                  <button
                    type="button"
                    onClick={() => onAddBelow(n.key)}
                    title="Add below"
                    aria-label="Add below"
                    className={cn(
                      "absolute top-full z-10 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:border-foreground/30 hover:text-foreground group-hover/oc:opacity-100 focus-visible:opacity-100",
                      n.childCount > 0 ? "left-[calc(50%+1.75rem)]" : "left-1/2 -translate-x-1/2",
                      selected && "opacity-100",
                    )}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
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
                        {/* read-gate-exempt: descendant count computed from the chart already on screen */}
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

        {drag && (
          <div
            className="pointer-events-none fixed z-50 flex -translate-x-1/2 -translate-y-[140%] items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 type-secondary font-medium text-foreground shadow-lg"
            style={{ left: drag.x, top: drag.y }}
          >
            {drag.keys.length > 1
              ? `Moving ${drag.keys.length}`
              : `Moving ${dragLabel ? dragLabel(nodeData(roots, drag.keys[0]) as T) : ""}`.trim()}
            {drag.target && !drag.accept && <span className="text-destructive">· can&apos;t go there</span>}
            {drag.moved && !drag.target && !drag.accept && <span className="text-muted-foreground">· let go to cancel</span>}
          </div>
        )}

        {/* Top bar: caller's controls + search (left), view controls (right). */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
          <div className="pointer-events-auto flex min-w-0 flex-wrap items-center gap-2" data-no-pan>
            {toolbar}
            {highlight && !q && (
              <div className="flex h-9 items-center gap-1 rounded-lg border border-warning/50 bg-card/95 pl-2.5 pr-1 shadow-sm backdrop-blur">
                <span className="max-w-48 truncate type-secondary font-medium text-foreground" title={highlight.label}>
                  {highlight.label}
                </span>
                <span className="whitespace-nowrap px-1 type-meta tabular-nums text-muted-foreground">
                  {matches.length ? `${Math.min(matchIndex, matches.length - 1) + 1}/${matches.length}` : "0"}
                </span>
                <ControlButton label="Next" onClick={() => goToMatch(selectedKey === matches[matchIndex] ? matchIndex + 1 : matchIndex)}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </ControlButton>
                <ControlButton label="Clear" onClick={highlight.onClear}>
                  <X className="h-3.5 w-3.5" />
                </ControlButton>
              </div>
            )}
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
                  placeholder="Find"
                  aria-label="Find in chart"
                  className="w-20 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:w-40 sm:text-sm"
                />
                {query && (
                  <>
                    <span className="whitespace-nowrap px-1 type-meta tabular-nums text-muted-foreground">
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
            <span className="hidden w-11 text-center type-meta tabular-nums text-muted-foreground sm:inline">
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
            <span className="hidden sm:contents">
              <ControlButton label="Minimap" active={showMinimap} onClick={() => setShowMinimap((v) => !v)}>
                <MapIcon className="h-3.5 w-3.5" />
              </ControlButton>
            </span>
            {exportTitle && (
              <>
                <span className="mx-0.5 h-5 w-px bg-border" />
                <ControlButton label={exporting ? "Preparing…" : "Download PNG"} onClick={() => void download("png")}>
                  <ImageDown className="h-3.5 w-3.5" />
                </ControlButton>
                <ControlButton label={exporting ? "Preparing…" : "Download PDF"} onClick={() => void download("pdf")}>
                  <FileDown className="h-3.5 w-3.5" />
                </ControlButton>
              </>
            )}
          </div>
        </div>

        {kindsInUse.length > 0 && (
          <div
            className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur sm:max-w-xs"
            data-no-pan
          >
            <div className="mb-1 hidden type-meta font-semibold uppercase tracking-wide text-muted-foreground sm:block">
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
                    <div className="type-secondary font-medium text-foreground">{kind.label}</div>
                    {kind.description && (
                      <div className="hidden type-meta leading-snug text-muted-foreground sm:block">{kind.description}</div>
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
        data-clickable=""
        className="overflow-hidden"
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


/** The data of the node with this key, anywhere in the forest. */
function nodeData<T>(roots: OrgChartTreeNode<T>[], key: string): T | undefined {
  const stack = [...roots];
  while (stack.length) {
    const n = stack.pop() as OrgChartTreeNode<T>;
    if (n.key === key) return n.data;
    stack.push(...n.children);
  }
  return undefined;
}

/** A gentle arc between two cards, leaving and entering through the facing sides. */
function crossLinkPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  w: number,
  h: number,
): string {
  const ac = { x: a.x + w / 2, y: a.y + h / 2 };
  const bc = { x: b.x + w / 2, y: b.y + h / 2 };
  const dx = bc.x - ac.x;
  const dy = bc.y - ac.y;
  if (Math.abs(dx) < w) {
    // Same column (e.g. a stacked team): a straight route would run behind the
    // cards between them, so leave and re-enter by the right side, bowing out.
    const sx = Math.max(a.x, b.x) + w;
    const bow = Math.min(90, 28 + Math.abs(dy) / 6);
    const start = { x: a.x + w, y: ac.y };
    const end = { x: b.x + w + 4, y: bc.y };
    return `M ${start.x} ${start.y} C ${sx + bow} ${start.y}, ${sx + bow} ${end.y}, ${end.x} ${end.y}`;
  }
  const horizontal = Math.abs(dx) * h > Math.abs(dy) * w;
  const start = horizontal
    ? { x: ac.x + Math.sign(dx) * (w / 2), y: ac.y }
    : { x: ac.x, y: ac.y + Math.sign(dy) * (h / 2) };
  const end = horizontal
    ? { x: bc.x - Math.sign(dx) * (w / 2 + 4), y: bc.y }
    : { x: bc.x, y: bc.y - Math.sign(dy) * (h / 2 + 4) };
  const bend = Math.min(120, Math.hypot(dx, dy) / 3);
  const c1 = horizontal ? { x: start.x + Math.sign(dx) * bend, y: start.y - bend / 2 } : { x: start.x + bend / 2, y: start.y + Math.sign(dy) * bend };
  const c2 = horizontal ? { x: end.x - Math.sign(dx) * bend, y: end.y - bend / 2 } : { x: end.x + bend / 2, y: end.y - Math.sign(dy) * bend };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}
