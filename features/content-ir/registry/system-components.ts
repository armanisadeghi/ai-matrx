/**
 * Compiled component-resolver bootstrap (Shape System ruling R1) — the
 * trusted-at-bootstrap FLOOR of the (kind, platform, role) → component
 * resolver, mirroring `content_ir.kind_component` rows for every kind that
 * ships a legacy bridge today.
 *
 * DERIVED from `SYSTEM_KIND_DEFINITIONS` so the floor can never drift from
 * the compiled registry: adding or removing a definition in system-kinds.ts
 * updates this bootstrap by construction. Two roles per kind:
 *
 * - `output` (one entry per `legacyBlockType` facet): `componentKey` IS the
 *   legacy block type string — the key the unified renderer's
 *   BlockComponentRegistry routes on (e.g. "flashcards").
 * - `input` (one entry per compiled kind, D1): `componentKey` is the generic
 *   bridged form — `KindInputForm` (features/content-ir/input/) resolves the
 *   kind schema, bridges it through `kindFieldsToVariableDefinitions` (R5),
 *   renders the production variable inputs, and emits a validated canonical
 *   instance. Every compiled kind gets this floor entry; a DB
 *   `kind_component` row with role='input' overrides it (a dedicated editor,
 *   once one is routed).
 *
 * R6: kinds present here are trusted at bootstrap. A DB row can refine the
 * resolution (component-registry.ts warm tier overrides), but a DB outage —
 * or a flipped `is_active` — can never un-resolve a bootstrap kind. That is
 * the whole point of a compiled floor.
 */

import type { JsonObject } from "@/types/json";
import { SYSTEM_KIND_DEFINITIONS } from "./system-kinds";

/**
 * MUST equal `GENERIC_STRUCTURED_COMPONENT_KEY` (react/kind-route.ts). The
 * literal is duplicated here — importing it would pull this registry module
 * into the react layer and close an import cycle (kind-route →
 * component-registry → here). Equality is pinned by
 * `__tests__/kind-input-form.test.ts`.
 */
const GENERIC_INPUT_COMPONENT_KEY = "generic_structured";

export interface SystemComponentEntry {
  /** Canonical kind slug — THE key (with platform + role). */
  kind: string;
  platform: "web";
  role: "output" | "input";
  /** output: the legacy block type string; input: the input-form routing key. */
  componentKey: string;
  source: "bundled";
  config: JsonObject;
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
    cache = SYSTEM_KIND_DEFINITIONS.flatMap((def): SystemComponentEntry[] => {
      const entries: SystemComponentEntry[] = [];
      if (def.legacyBlockType) {
        entries.push({
          kind: def.kind,
          platform: "web",
          role: "output",
          componentKey: def.legacyBlockType,
          source: "bundled",
          config: {},
        });
      }
      // D1 input floor: every compiled kind can collect an instance through
      // the generic bridged form. DB rows override per (kind, platform, role).
      entries.push({
        kind: def.kind,
        platform: "web",
        role: "input",
        componentKey: GENERIC_INPUT_COMPONENT_KEY,
        source: "bundled",
        config: {},
      });
      return entries;
    });
  }
  return cache;
}
