/**
 * Transient per-tab panels (share sheet, admin debug) opened from a tab's "…"
 * menu. Deliberately NOT canvas state: reloading the page must not reopen a
 * share sheet. One module store, keyed by canvas item id.
 */

import { useSyncExternalStore } from "react";

export type ArtifactPanel = "share" | "debug";

const STORE = Symbol.for("ai-matrx.host.canvas.artifact-panels");

interface PanelStore {
  open: Map<string, ArtifactPanel>;
  listeners: Set<() => void>;
}

function store(): PanelStore {
  const g = globalThis as unknown as { [STORE]?: PanelStore };
  g[STORE] ??= { open: new Map(), listeners: new Set() };
  return g[STORE];
}

function emit() {
  for (const listener of [...store().listeners]) listener();
}

export function openArtifactPanel(itemId: string, panel: ArtifactPanel) {
  store().open.set(itemId, panel);
  emit();
}

export function toggleArtifactPanel(itemId: string, panel: ArtifactPanel) {
  if (store().open.get(itemId) === panel) closeArtifactPanel(itemId);
  else openArtifactPanel(itemId, panel);
}

export function closeArtifactPanel(itemId: string) {
  if (store().open.delete(itemId)) emit();
}

function subscribe(listener: () => void) {
  store().listeners.add(listener);
  return () => store().listeners.delete(listener);
}

export function useArtifactPanel(itemId: string): ArtifactPanel | null {
  return useSyncExternalStore(
    subscribe,
    () => store().open.get(itemId) ?? null,
    () => null,
  );
}
