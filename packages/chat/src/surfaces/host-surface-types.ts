/** Shapes the package's surface tools read from the host's admin surface UI (the host's components re-export them). */
import type { SurfaceReadinessBucket } from "./services/surfaces.service";

export type StatusFilter = "all" | "active" | "inactive";
export type ManifestFilter = "all" | "with_manifest" | "without_manifest";
export type ReadinessFilter = SurfaceReadinessBucket | "all";
/** THE UI SURFACE CHECKLIST ledger filter — the dispatch queue. */
export type CheckedFilter = "all" | "never" | "stale" | "fresh";

export interface SurfacesFilterState {
  status: StatusFilter;
  client: string;
  manifest: ManifestFilter;
  /** `__all__` | `__none__` (roots) | a parent surface name */
  parent: string;
  /** Readiness bucket, driven by the rollup tiles above the filter bar. */
  readiness: ReadinessFilter;
  /** Last completed full surface check (see surface-check-ledger). */
  checked: CheckedFilter;
}

export interface NewSurfaceDraftScope {
  name: string;
  client: string;
  local: string;
  parent_surface_name: string | null;
  tier: string;
  description: string;
}

/**
 * One row in the binding form. Drives a single agent variable / context
 * slot through the four user-facing source choices:
 *
 *   Agent Default | Surface Value | Direct Value | Prompt User
 *
 * Internally these map to the existing DSL:
 *   Agent Default → { mapType: "unmapped" }
 *   Surface Value → { mapType: "surface_value", target }
 *   Direct Value  → { mapType: "direct_value", target }
 *   Prompt User   → { mapType: "prompt_user", prompt }
 *
 * The detail panel below the buttons reserves a fixed height so flipping
 * between modes never shifts the row above or below it.
 */

export interface BindingTarget {
  /** Variable / context-policy name as stored on the agent. */
  name: string;
  /** Optional pre-formatted label. Falls back to the prettified name. */
  label?: string;
  /** Optional natural-language description (shown on hover via tooltip). */
  description?: string;
  /** Whether the agent has the target marked as required. */
  required?: boolean;
  /** Agent-authored default for variables; omitted for context policies. */
  defaultValue?: unknown;
}
