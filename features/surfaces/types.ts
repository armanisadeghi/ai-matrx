/**
 * Surface Values System — public TypeScript surface.
 *
 * A `SurfaceValue` is a named runtime value a UI surface declares it can
 * supply at execution time. Surfaces register a `SurfaceManifest` in code;
 * the registry is mirrored into `public.ui_surface_value` so binding UIs
 * (agent mapping editors, tool mapping editors, audit views) can pick from
 * the same list the runtime actually emits.
 *
 * The `ValueMapping` discriminated union is the JSONB shape stored in
 * `agx_agent_surface.value_mappings`. A single resolver consumes it for
 * agent variables and agent context slots.
 *
 * NOTE: Tool arg-defaults moved out of this model in the 2026 tool-system
 * refactor. They now live as plain literal jsonb in
 * `tool_surface_defaults.arg_defaults` (no surface_value indirection), so
 * the tool side of `BrokenMapping` is permanently empty going forward.
 *
 * See:
 *   - `features/surfaces/manifests/registry.ts`   (the registry)
 *   - `features/surfaces/utils/value-mapping-resolver.ts` (the resolver)
 *   - `features/surfaces/services/manifest-sync.service.ts` (drift + sync)
 */

import type { ApplicationScope } from "@/features/agents/types/scope.types";

// ---------------------------------------------------------------------------
// SurfaceValue — schema for one named value a surface declares.
// ---------------------------------------------------------------------------

/** Logical type of a surface value. Most are stringified for LLMs at runtime. */
export type SurfaceValueType = "string" | "number" | "boolean" | "object" | "array";

export interface SurfaceValue {
  /**
   * Lower-snake-case key, unique within the surface (e.g. `selection`,
   * `current_file`, `open_tabs`). Becomes the key in `ApplicationScope`.
   */
  name: string;

  /** Short human label for binding UIs (e.g. "Current selection"). */
  label: string;

  /** When this value is populated and what it represents. 1-2 sentences. */
  description: string;

  /** Logical type; mostly stringified for LLMs but drives binding UI affordances. */
  valueType: SurfaceValueType;

  /**
   * True when the surface guarantees a value every time it launches an
   * execution. False for things like `selection` that are commonly undefined.
   */
  alwaysAvailable: boolean;

  /**
   * Rough average char count after stringification. Used by mapping UIs to
   * warn when binding to a value that could blow LLM context windows (e.g.
   * "all open tabs", "full file contents").
   */
  typicalCharCount: number;

  /** Optional sort order within the surface; defaults to 1000 in DB. */
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// SurfaceManifest — what a single surface declares.
// ---------------------------------------------------------------------------

export interface SurfaceManifest {
  /** Matches `ui_surface.name`. */
  surfaceName: string;
  /** Flat list of SurfaceValues this surface declares. */
  values: readonly SurfaceValue[];
}

// ---------------------------------------------------------------------------
// ValueMapping — the JSONB shape that lives on bindings.
// ---------------------------------------------------------------------------

/** Map types v1. Adding a new type is a TS branch + resolver case; no SQL changes. */
export type ValueMappingType =
  | "surface_value"
  | "direct_value"
  | "prompt_user"
  | "unmapped";

/**
 * One mapping entry. Discriminated by `mapType`. Stored in JSONB so the DB
 * shape is `Record<string, ValueMapping>`.
 *
 * - `surface_value` — bind to a SurfaceValue the surface declares. Resolver
 *   reads from `ApplicationScope` at launch.
 * - `direct_value`  — fixed literal scoped to this binding; overrides the
 *   agent's own default while running here.
 * - `prompt_user`   — show a one-shot dialog before launch (agent bindings
 *   only — rejected for tool arg_mappings).
 * - `unmapped`      — explicit suppression of auto-name-match for this key.
 */
export type ValueMapping =
  | {
      mapType: "surface_value";
      /** SurfaceValue.name on the owning surface. */
      target: string;
      /** If true, abort execution when the surface fails to supply a value at runtime. */
      required?: boolean;
    }
  | {
      mapType: "direct_value";
      /** The literal value (string, number, boolean, object, array). */
      target: unknown;
    }
  | {
      mapType: "prompt_user";
      /** The prompt text shown in the input dialog. */
      prompt: string;
      /** Optional pre-filled value. */
      defaultValue?: unknown;
      /** If true, the user cannot cancel; submit is the only way out. */
      required?: boolean;
    }
  | {
      mapType: "unmapped";
    };

/** Keys are agent variable / context-slot names, or tool arg names. */
export type ValueMappingMap = Record<string, ValueMapping>;

// ---------------------------------------------------------------------------
// Drift report — produced by the manifest sync service.
// ---------------------------------------------------------------------------

/** Single drift entry for a SurfaceValue not synced between code and DB. */
export interface SurfaceValueDrift {
  surfaceName: string;
  valueName: string;
  /** `manifest_only` = code has it, DB doesn't. `db_only` = DB has it, code doesn't. `diff` = both have it but fields differ. */
  kind: "manifest_only" | "db_only" | "diff";
  /** Field-level diff when `kind === "diff"`. */
  diff?: Partial<Record<keyof SurfaceValue, { manifest: unknown; db: unknown }>>;
}

/** Single broken-mapping entry — a JSONB mapping references a target that no longer exists. */
export interface BrokenMapping {
  /** Always "agent" post-2026 refactor; tool-side mappings no longer exist. */
  bindingKind: "agent" | "tool";
  /** Row id of the binding (`agx_agent_surface.id`). */
  bindingId: string;
  /** Surface this binding is for. */
  surfaceName: string;
  /** Variable / slot / arg name whose mapping is broken. */
  mappingKey: string;
  /** The bad target. */
  badTarget: string;
  /** Snapshot of the offending ValueMapping for the UI. */
  mapping: ValueMapping;
}

export interface SurfaceDriftReport {
  /** Surface values that exist in code manifests but not in DB. */
  manifestsMissingInDb: SurfaceValueDrift[];
  /** Surface values that exist in DB but no longer in any code manifest. */
  dbValuesNotInManifest: SurfaceValueDrift[];
  /** Surface values present in both but with diverging field values. */
  diffs: SurfaceValueDrift[];
  /** Broken `surface_value` mappings in `agx_agent_surface.value_mappings`. */
  brokenAgentMappings: BrokenMapping[];
  /**
   * Always empty post-2026 refactor — `tl_def_surface.arg_mappings` was
   * dropped along with the table. Tool arg-defaults are now literal jsonb
   * in `tool_surface_defaults.arg_defaults` (no indirection to break).
   * Kept on the type for back-compat with admin UIs that iterate it.
   * @deprecated Will be removed once admin UI stops reading this field.
   */
  brokenToolMappings: BrokenMapping[];
}

// ---------------------------------------------------------------------------
// Type guards / helpers.
// ---------------------------------------------------------------------------

export function isValueMapping(input: unknown): input is ValueMapping {
  if (typeof input !== "object" || input === null) return false;
  const mt = (input as { mapType?: unknown }).mapType;
  return (
    mt === "surface_value" ||
    mt === "direct_value" ||
    mt === "prompt_user" ||
    mt === "unmapped"
  );
}

export function isValueMappingMap(input: unknown): input is ValueMappingMap {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  for (const v of Object.values(input as Record<string, unknown>)) {
    if (!isValueMapping(v)) return false;
  }
  return true;
}

/**
 * Convenience type for surface scope payloads: the data a surface assembles
 * and hands to the launcher. Compatible with `ApplicationScope` (string-keyed,
 * `unknown` values). Kept as a re-export so consumers in this feature don't
 * need to import from `features/agents/types/scope.types`.
 */
export type SurfaceScopePayload = ApplicationScope;
