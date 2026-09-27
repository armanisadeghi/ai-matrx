// components/selection-toolbar/selection-zones.ts
//
// THE SELECTION TOOLBAR's zone store. A document has exactly ONE text
// selection, so the app has exactly ONE selection toolbar
// (`SelectionToolbarRoot`, mounted once under the Alchemy host). A surface
// never draws its own popup: it registers a ZONE — the element its text lives
// in plus what it contributes (its half of the click target, whether it edits,
// the panels it draws inside the toolbar). The root finds every zone holding
// the selection, merges their halves into ONE Alchemy ClickTarget, and the ONE
// action registry decides what shows.
//
// Hosts today: the context menu shell (every selectable surface), the rich
// editor (formatting), the annotation sidecar (highlight / comment / suggest /
// link) and the surfaces that add passage actions (the study guide's tutor).

"use client";

import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

/** Editing shows formatting; reading shows highlight / suggest / link. */
export type SelectionMode = "edit" | "read";

/** What a running action (or a panel) may do to the toolbar. */
export interface SelectionToolbarUi {
  /** Swap the strip for one of the zone's panels (a comment composer), handing it `payload`. */
  openPanel(panel: string, payload?: unknown): void;
  /** Back to the strip. */
  closePanel(): void;
  /** Close the toolbar. `clearSelection` also drops the text selection. */
  close(options?: { clearSelection?: boolean }): void;
}

export interface SelectionZoneContribution {
  /**
   * This zone's halves of the composite ClickTarget host, keyed by provider
   * (`{ annotation: … }`, `{ richEditor: … }`). Providers narrow their own key.
   */
  host?: Record<string, unknown>;
  /** The text here is being edited (a rich editor, an editable field). */
  editable?: boolean;
  /**
   * Stop here: zones OUTSIDE this one contribute nothing for a selection in
   * it, and when nothing deeper contributes the toolbar stays closed (a
   * surface that owns its own passage UI, e.g. a chat answer's action bar).
   */
  suppress?: boolean;
  /** Panels this zone draws inside the toolbar frame. Null = not this zone's. */
  renderPanel?(panel: string, ui: SelectionToolbarUi, payload: unknown): ReactNode | null;
  /**
   * CARET MODE: where to anchor the toolbar when the selection is only a caret
   * here, or null to stay closed. The rich editor answers with its table's box
   * while the caret is in a table (the table actions are toolbar actions).
   */
  caretAnchor?(): { left: number; top: number; bottom: number; width: number } | null;
  /** A panel (and its payload) to show immediately when the toolbar opens here (a pending reattach). */
  initialPanel?(): { panel: string; payload?: unknown } | null;
}

interface ZoneEntry {
  id: string;
  element: HTMLElement;
  read: () => SelectionZoneContribution;
}

const zones = new Map<string, ZoneEntry>();
const listeners = new Set<() => void>();
let version = 0;

function notify() {
  version += 1;
  for (const l of [...listeners]) l();
}

export function subscribeSelectionZones(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function selectionZonesVersion(): number {
  return version;
}

/** Re-render when zones mount/unmount (the root re-evaluates an open toolbar). */
export function useSelectionZonesVersion(): number {
  return useSyncExternalStore(subscribeSelectionZones, selectionZonesVersion, () => 0);
}

/** Tell the root a zone's contribution changed (a pending reattach started). */
export function notifySelectionZonesChanged(): void {
  notify();
}

export interface ResolvedZone {
  id: string;
  element: HTMLElement;
  contribution: SelectionZoneContribution;
}

/**
 * Every zone holding `node`, deepest first, cut at the first `suppress` zone
 * (which itself contributes nothing).
 */
export function zonesContaining(node: Node | null): ResolvedZone[] {
  if (!node) return [];
  const hits: ResolvedZone[] = [];
  for (const z of zones.values()) {
    if (z.element.isConnected && z.element.contains(node)) {
      hits.push({ id: z.id, element: z.element, contribution: z.read() });
    }
  }
  // Deepest first: a zone inside another sorts before it.
  hits.sort((a, b) => (a.element === b.element ? 0 : a.element.contains(b.element) ? 1 : -1));
  const out: ResolvedZone[] = [];
  for (const z of hits) {
    if (z.contribution.suppress) break;
    out.push(z);
  }
  return out;
}

/**
 * Register `element` as a selection zone for as long as the caller is mounted.
 * The contribution is read fresh at every selection (a ref), so passing a new
 * object each render never re-registers.
 */
export function useSelectionZone(
  element: HTMLElement | null,
  contribution: SelectionZoneContribution | null,
): void {
  const id = useId();
  const latest = useRef(contribution);
  // Read at selection time (an event), so the post-commit value is always current.
  useLayoutEffect(() => {
    latest.current = contribution;
  });
  const enabled = contribution !== null;
  useEffect(() => {
    if (!element || !enabled) return;
    zones.set(id, { id, element, read: () => latest.current ?? {} });
    notify();
    return () => {
      zones.delete(id);
      notify();
    };
  }, [id, element, enabled]);
}
