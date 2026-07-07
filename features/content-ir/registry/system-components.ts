/**
 * Compiled component-resolver bootstrap (Shape System ruling R1) — the
 * trusted-at-bootstrap FLOOR of the (kind, platform, role) → component
 * resolver, mirroring `content_ir.kind_component` rows for every kind that
 * ships a legacy bridge today.
 *
 * DERIVED from `SYSTEM_KIND_DEFINITIONS` (one entry per `legacyBlockType`
 * facet) so the floor can never drift from the real compiled bridges: adding
 * or removing a bridge in system-kinds.ts updates this bootstrap by
 * construction. `componentKey` IS the legacy block type string — the key the
 * unified renderer's BlockComponentRegistry routes on (e.g. "flashcards").
 *
 * R6: kinds present here are trusted to render at bootstrap. A DB row can
 * refine the resolution (component-registry.ts warm tier overrides), but a
 * DB outage — or a flipped `is_active` — can never un-render a bootstrap
 * kind. That is the whole point of a compiled floor.
 */

import { SYSTEM_KIND_DEFINITIONS } from "./system-kinds";

export interface SystemComponentEntry {
  /** Canonical kind slug — THE key (with platform + role). */
  kind: string;
  platform: "web";
  role: "output";
  /** The legacy block type string the unified renderer routes on. */
  componentKey: string;
  source: "bundled";
  config: Record<string, unknown>;
}

let cache: SystemComponentEntry[] | null = null;

/**
 * LAZY on purpose: this module sits on an import cycle (system-kinds →
 * kinds/* → legacy-bridge-utils → render-block-envelope →
 * region-envelope-memo → component-registry → here → system-kinds), so
 * `SYSTEM_KIND_DEFINITIONS` is not yet initialized at module-eval time.
 * First call happens at runtime (first resolve), when every module is fully
 * loaded.
 */
export function getSystemComponentEntries(): SystemComponentEntry[] {
  if (!cache) {
    cache = SYSTEM_KIND_DEFINITIONS.flatMap((def) =>
      def.legacyBlockType
        ? [
            {
              kind: def.kind,
              platform: "web" as const,
              role: "output" as const,
              componentKey: def.legacyBlockType,
              source: "bundled" as const,
              config: {},
            },
          ]
        : [],
    );
  }
  return cache;
}
