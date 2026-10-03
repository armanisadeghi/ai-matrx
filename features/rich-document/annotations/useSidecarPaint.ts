// features/rich-document/annotations/useSidecarPaint.ts
//
// THE PAINTER. CSS Custom Highlight API only: ranges are registered with
// `CSS.highlights`, the browser draws them, and the rendered DOM is never
// wrapped, split or mutated — pointer and keyboard interaction pass straight
// through (brief: "Paint layers must let ordinary pointer and keyboard
// interaction pass through"). Where the API is absent nothing is painted and
// the panel still lists every item (capabilities.paint = false says so).
//
// Re-paints when the renderer settles (MutationObserver, debounced) because
// <RichDocument> renders asynchronously and re-renders on streaming.

"use client";

import { useEffect, useRef } from "react";
import { projectSource, projectionIsCurrent, sourceToRanges, type SourceProjection } from "./projection";
import { HIGHLIGHT_COLORS } from "./constants";
import type { ResolvedItem } from "./types";

type HighlightRegistry = { set: (k: string, v: unknown) => void; delete: (k: string) => void };
type HighlightCtor = new (...ranges: Range[]) => unknown;

function registry(): { reg: HighlightRegistry; Ctor: HighlightCtor } | null {
  if (typeof CSS === "undefined") return null;
  const reg = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  const Ctor = (globalThis as unknown as { Highlight?: HighlightCtor }).Highlight;
  return reg && Ctor ? { reg, Ctor } : null;
}

/** Paint layer names for one sidecar instance. */
export function paintLayers(instance: string) {
  return {
    color: (c: string) => `mx-annot-${instance}-${c}`,
    comment: `mx-annot-${instance}-comment`,
    suggestion: `mx-annot-${instance}-suggestion`,
    unsaved: `mx-annot-${instance}-unsaved`,
    active: `mx-annot-${instance}-active`,
    link: `mx-annot-${instance}-link`,
  };
}

/**
 * The class on the element(s) an instance paints in. Its highlight rules are
 * scoped to it: an unscoped `::highlight(name)` rule applies to EVERY element
 * on the page, so each rendered document (every chat message, note, document
 * body) added ten page-wide rules and the style cost grew with documents ×
 * elements — one restyle (a menu opening) took ~400 ms per long chat on a
 * board and ~21 s with five, enough to crash the tab (2026-10-02). With an
 * ancestor class Chrome's bloom filter rejects every element outside the
 * document at once.
 */
export function paintScopeClass(instance: string): string {
  return `mx-annot-scope-${instance}`;
}

/** The stylesheet the painter's layer names need (semantic tokens only), scoped to the instance's root. */
export function paintCss(instance: string): string {
  const L = paintLayers(instance);
  const scope = `.${paintScopeClass(instance)}`;
  const at = (name: string) => `${scope}::highlight(${name}),${scope} ::highlight(${name})`;
  const colorVar: Record<string, string> = {
    yellow: "var(--color-yellow-300, #fde047)",
    green: "var(--color-green-300, #86efac)",
    blue: "var(--color-sky-300, #7dd3fc)",
    pink: "var(--color-pink-300, #f9a8d4)",
    purple: "var(--color-violet-300, #c4b5fd)",
  };
  const rules = HIGHLIGHT_COLORS.map(
    (c) => `${at(L.color(c))}{background-color:color-mix(in srgb, ${colorVar[c]} 55%, transparent);color:inherit;}`,
  );
  rules.push(
    `${at(L.comment)}{background-color:color-mix(in srgb, var(--primary) 16%, transparent);text-decoration:underline;text-decoration-color:var(--primary);text-decoration-thickness:2px;}`,
    `${at(L.suggestion)}{text-decoration:line-through;text-decoration-color:var(--destructive);text-decoration-thickness:2px;background-color:color-mix(in srgb, var(--destructive) 10%, transparent);}`,
    `${at(L.link)}{text-decoration:underline dotted;text-decoration-color:var(--primary);text-decoration-thickness:2px;}`,
    // A refused or not-yet-confirmed mark must never look saved.
    `${at(L.unsaved)}{text-decoration:underline wavy;text-decoration-color:var(--destructive);background-color:transparent;}`,
    `${at(L.active)}{background-color:color-mix(in srgb, var(--primary) 30%, transparent);}`,
  );
  return rules.join("\n");
}

export function useSidecarPaint(
  root: HTMLElement | null,
  body: string,
  items: ResolvedItem[],
  instance: string,
  activeKey: string | null,
  onProjection?: (p: SourceProjection | null) => void,
) {
  const projectionRef = useRef<SourceProjection | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const activeRef = useRef(activeKey);
  activeRef.current = activeKey;
  const onProjectionRef = useRef(onProjection);
  onProjectionRef.current = onProjection;

  // Re-project when the rendered DOM changes.
  useEffect(() => {
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const project = () => {
      projectionRef.current = projectSource(root, body);
      onProjectionRef.current?.(projectionRef.current);
      paint();
    };
    const paint = () => paintAll(projectionRef.current, itemsRef.current, instance, activeRef.current);
    project();
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(project, 120);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
      clearAll(instance);
    };
  }, [root, body, instance]);

  // Re-paint when items or the active item change — on the DOM as it is now,
  // not a map the debounced observer has not refreshed yet.
  useEffect(() => {
    if (root && projectionRef.current && !projectionIsCurrent(projectionRef.current, root)) {
      projectionRef.current = projectSource(root, body);
      onProjectionRef.current?.(projectionRef.current);
    }
    paintAll(projectionRef.current, items, instance, activeKey);
  }, [root, body, items, instance, activeKey]);

  return projectionRef;
}

function clearAll(instance: string) {
  const r = registry();
  if (!r) return;
  const L = paintLayers(instance);
  for (const c of HIGHLIGHT_COLORS) r.reg.delete(L.color(c));
  for (const k of [L.comment, L.suggestion, L.unsaved, L.active, L.link]) r.reg.delete(k);
}

function paintAll(
  projection: SourceProjection | null,
  items: ResolvedItem[],
  instance: string,
  activeKey: string | null,
) {
  const r = registry();
  if (!r || !projection) return;
  const L = paintLayers(instance);
  const layers = new Map<string, Range[]>();
  const add = (layer: string, ranges: Range[]) => layers.set(layer, [...(layers.get(layer) ?? []), ...ranges]);
  for (const item of items) {
    const res = item.resolution;
    if (!res || res.status === "orphaned" || res.start16 == null || res.end16 == null) continue;
    if (item.kind === "comment" && item.resolvedAt) continue;
    if (item.kind === "suggestion" && item.resolvedAt) continue;
    const ranges = sourceToRanges(projection, res.start16, res.end16);
    if (ranges.length === 0) continue;
    if (item.saveState !== "confirmed") add(L.unsaved, ranges);
    else if (item.kind === "highlight") add(L.color(item.color ?? "yellow"), ranges);
    else if (item.kind === "suggestion") add(L.suggestion, ranges);
    else if (item.kind === "link") add(L.link, ranges);
    else add(L.comment, ranges);
    if (item.key === activeKey) add(L.active, ranges.map((x) => x.cloneRange()));
  }
  const all = [...HIGHLIGHT_COLORS.map((c) => L.color(c)), L.comment, L.suggestion, L.unsaved, L.active, L.link];
  for (const name of all) {
    const ranges = layers.get(name);
    if (ranges && ranges.length) r.reg.set(name, new r.Ctor(...ranges));
    else r.reg.delete(name);
  }
}
