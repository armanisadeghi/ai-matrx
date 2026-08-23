/**
 * THE MATRIX ADAPTER around the shared component resolver.
 *
 * The resolver itself — the (kind, platform, role) tiers, the compiled floor,
 * the DB override, the granular per-kind repaint counters, the cold-fetch
 * dedupe, the warm/refresh lifecycle with loud recovery — now lives in
 * `@ai-matrx/content-ir-react` (`ComponentResolver`), because every UI that
 * renders a kind has to make exactly those decisions and a second copy of them
 * is a guaranteed divergence.
 *
 * What stays here is what is genuinely OURS: the Supabase-backed loaders, the
 * Error Inspector sink, the compiled bootstrap derived from `system-kinds`, the
 * `refreshKindComponents` name our call sites use, and the invalidation
 * registration at the bottom of this file.
 *
 * Semantics (rulings R1 + R6) are documented on the package class; read that
 * before changing behavior here — behavior does not belong here.
 */

// CYCLE-ENTRY ANCHOR — load-bearing side-effect import. This module reaches
// system-kinds (via system-components), and the registry cluster has a cycle
// (system-kinds → kinds/* → legacy-bridge-utils → render-block-envelope →
// region-envelope-memo → kind-registry → system-kinds) whose only safe entry
// is kind-registry (its singleton constructs EAGERLY at module scope; every
// other module in the cycle defers use to call time). Evaluating
// kind-registry first guarantees any consumer entering through THIS module
// initializes the cycle in the safe order.
import "./kind-registry";
import {
  ComponentResolver,
  type ComponentResolution,
  type ComponentRole,
  type KindComponentRow,
} from "@ai-matrx/content-ir-react";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import {
  INVALIDATION_KEYS,
  registerInvalidationCallback,
} from "@/lib/invalidation/invalidation-registry";
import {
  getKindComponentBySlug,
  listKindComponentsFromTables,
  type KindComponentProjection,
} from "./schema-source-kind-components";
import {
  getSystemComponentEntries,
  type SystemComponentEntry,
} from "./system-components";

export type { ComponentResolution, ComponentRole };

/**
 * The `kind_component` projection is already row-shaped; only `role` is typed
 * wider here (the column is free text in the generated types) than the
 * resolver's union.
 */
function toRow(
  projection: KindComponentProjection | KindComponentRow,
): KindComponentRow {
  return { ...projection, role: asComponentRole(projection.role) };
}

/**
 * `kind_component.role` is free text in the generated DB types; the resolver
 * models the two roles it actually dispatches on. An unrecognised role is a
 * malformed row, not a new tier — it screams and falls back to `output` so one
 * bad row can never blank a kind.
 */
function asComponentRole(role: string): ComponentRole {
  if (role === "output" || role === "input") return role;
  const message = `[content-ir] kind_component.role "${role}" is not a known component role — treating it as "output".`;
  console.error(message);
  captureError({ source: "content-ir", message, raw: { role } });
  return "output";
}

/**
 * The Matrix resolver: the shared class with our loaders and our error sink
 * bound, plus the `refreshKindComponents` alias every call site here uses.
 */
export class ComponentRegistry extends ComponentResolver {
  constructor(entries: () => SystemComponentEntry[]) {
    super({
      compiledEntries: entries,
      loadAll: async () => (await listKindComponentsFromTables()).map(toRow),
      loadForKind: async (kind, platform) =>
        (await getKindComponentBySlug(kind, platform)).map(toRow),
      reportError: captureError,
    });
  }

  /**
   * Ingest/replace accept the SUPABASE PROJECTION (whose `role` is the
   * column's free text) and narrow it here — the one place that mapping
   * belongs. Overridden rather than adapted at ~15 call sites.
   */
  override ingestDbRows(
    rows: readonly (KindComponentProjection | KindComponentRow)[],
  ): void {
    super.ingestDbRows(rows.map(toRow));
  }

  override replaceDbRows(
    rows: readonly (KindComponentProjection | KindComponentRow)[],
  ): void {
    super.replaceDbRows(rows.map(toRow));
  }

  /** Historical name for the package's `refresh` — kept so call sites read the same. */
  refreshKindComponents(maxAgeMs?: number): Promise<void> {
    return this.refresh(maxAgeMs);
  }
}

export const componentRegistry = new ComponentRegistry(
  getSystemComponentEntries,
);

/**
 * The seam-facing resolver (ruling R1): which component renders `kind` on
 * `platform` in `role`? Synchronous; answers from the DB override once warm,
 * else the compiled floor, else null (unknown kind).
 */
export function resolveComponent(
  kind: string,
  platform: string,
  role: ComponentRole,
): ComponentResolution | null {
  return componentRegistry.resolve(kind, platform, role);
}

/**
 * Refresh-on-view for `source='db'` components (module-level convenience over
 * the singleton): re-fetches `kind_component`, replaces the db tier, notifies
 * `subscribeKindComponents` listeners. Rate-limited + deduped — safe to call on
 * every preview/authoring-surface mount. Server-side edits never push to open
 * clients; call this (or wait for a fresh session) to see them.
 */
export function refreshKindComponents(maxAgeMs?: number): Promise<void> {
  return componentRegistry.refreshKindComponents(maxAgeMs);
}

/** Subscribe to resolver db-tier replacements. Returns the unsubscribe. */
export function subscribeKindComponents(listener: () => void): () => void {
  return componentRegistry.subscribe(listener);
}

// The D115 inversion: this cluster registers its own invalidation at module
// init (it is initialized wherever a `__kind` block can render); the
// ubiquitous `toolStateEffects` fires it by NAME when an agent's `kindcomp_*`
// write completes — ZERO import edge from the stream-processing chunk into
// this registry cluster (the `await import()` edge that OOM-killed 12 builds).
// The force refresh (maxAgeMs 0) replaces the db tier and notifies; the
// per-kind repaint machinery + the `updated_at`-keyed compile cache do the
// rest, so mounted blocks recompile the edited component without a refresh.
registerInvalidationCallback(INVALIDATION_KEYS.kindComponents, () => {
  void refreshKindComponents(0);
});
