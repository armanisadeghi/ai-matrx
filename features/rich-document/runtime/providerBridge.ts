// features/rich-document/runtime/providerBridge.ts
//
// Module-scope imperative registry — maps providerId → live ctx getter +
// resolved action list. This is the bridge that lets a remote
// RichDocumentActionSurface invoke handlers owned by a RichDocument
// living elsewhere in the tree, WITHOUT putting functions in Redux state.
//
// Pattern mirrors the overlay system's callbackManager (same problem:
// callbacks living in module scope that the Redux-driven controller
// looks up by id). See features/overlays/FEATURE.md for the original.
//
// Lifecycle: RichDocument mounts → registerBridge(providerId, ...) →
// re-render → updateBridge(providerId, ...) → unmount → unregisterBridge.
// The Redux slice tracks WHICH providers are active per surfaceId; this
// module tracks WHAT each provider can actually do.

import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../types";

export interface ProviderBridge {
  /** Builds a fresh action context from the host's live state/refs. */
  getCtx: () => RichDocumentActionContext;
  /** The actions visible for this provider (already filtered + sorted). */
  resolvedActions: RichDocumentAction[];
}

// Plain Map — providerIds are React.useId() values, no leak risk because
// every register has a matching unregister on unmount.
const BRIDGES = new Map<string, ProviderBridge>();

export function registerBridge(
  providerId: string,
  bridge: ProviderBridge,
): void {
  BRIDGES.set(providerId, bridge);
}

/**
 * Refresh an existing bridge (no semantic difference from register today,
 * but kept separate so call sites are self-documenting).
 */
export function updateBridge(
  providerId: string,
  bridge: ProviderBridge,
): void {
  BRIDGES.set(providerId, bridge);
}

export function unregisterBridge(providerId: string): void {
  BRIDGES.delete(providerId);
}

export function getBridge(providerId: string): ProviderBridge | undefined {
  return BRIDGES.get(providerId);
}

/** Diagnostics only. */
export function _getAllBridges(): ReadonlyMap<string, ProviderBridge> {
  return BRIDGES;
}
