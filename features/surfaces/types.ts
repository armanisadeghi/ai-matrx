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
export type SurfaceValueType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array";

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
// SurfaceAgentRole — a named agent position a surface uses.
// ---------------------------------------------------------------------------

/**
 * Declared in manifests, mirrored to `public.ui_surface_agent_role` by
 * manifest sync (same lifecycle as SurfaceValue). A role is somewhere the
 * surface PLUGS IN an agent: cleanup's `clean` + `custom_slot`, scribe's
 * `assistant`. The manifest's `defaultAgentId` is the platform default;
 * users/orgs override via `ui_surface_agent_pref` rows (selection per role,
 * resolved global → org-by-membership → user).
 */
export interface SurfaceAgentRole {
  /** lower_snake_case, unique per surface (e.g. `clean`, `custom_slot`). */
  name: string;
  label: string;
  description: string;
  /** `single` = one agent fills it; `multi` = ordered positions (slots). */
  kind: "single" | "multi";
  /** Platform default agent id (system-owned UUID). Null = starts empty. */
  defaultAgentId: string | null;
  /** kind="multi" only — max concurrent positions. Defaults to 1. */
  maxAgents?: number;
  /** User may slot ANY agent (true, default) vs roster/system agents only. */
  allowCustom?: boolean;
  /** Auto-run semantics for agents in this role. Default "user-choice". */
  autoRun?: "always" | "never" | "user-choice";
  sortOrder?: number;
}

/**
 * A config namespace the surface consumes from `public.ui_surface_config`
 * (dictionary, session_defaults, …). Code-only declaration — the handler
 * (validate/merge/empty) is registered in
 * `features/surfaces/config/namespace-registry.ts`.
 */
export interface SurfaceConfigNamespaceDecl {
  /** Must exist in the namespace registry. */
  namespace: string;
  label: string;
  description: string;
}

// ---------------------------------------------------------------------------
// SurfaceManifest — what a single surface declares.
// ---------------------------------------------------------------------------

export interface SurfaceManifest {
  /** Matches `ui_surface.name`. */
  surfaceName: string;
  /** Flat list of SurfaceValues this surface declares. */
  values: readonly SurfaceValue[];
  /** Agent positions this surface uses. Mirrored to ui_surface_agent_role. */
  agentRoles?: readonly SurfaceAgentRole[];
  /** Config namespaces this surface consumes (code-only declaration). */
  configNamespaces?: readonly SurfaceConfigNamespaceDecl[];
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
  diff?: Partial<
    Record<keyof SurfaceValue, { manifest: unknown; db: unknown }>
  >;
}

/** Single drift entry for a SurfaceAgentRole not synced between code and DB. */
export interface SurfaceAgentRoleDrift {
  surfaceName: string;
  roleName: string;
  /** `manifest_only` = code has it, DB doesn't. `db_only` = DB has it, code doesn't. `diff` = both have it but fields differ. */
  kind: "manifest_only" | "db_only" | "diff";
  /** Field-level diff when `kind === "diff"`. */
  diff?: Partial<
    Record<keyof SurfaceAgentRole, { manifest: unknown; db: unknown }>
  >;
}

/** A config namespace referenced somewhere but missing a registered handler. */
export interface UnknownNamespace {
  namespace: string;
  /** `manifest` = declared in a manifest's `configNamespaces`. `db` = present on `ui_surface_config` rows. */
  source: "manifest" | "db";
  /** Declaring surface (manifest side only — DB rows are reported per distinct namespace). */
  surfaceName?: string;
}

/** Single broken-mapping entry — a JSONB mapping references a target that no longer exists. */
export interface BrokenMapping {
  /** The kind of binding whose mapping is broken. */
  bindingKind: "agent";
  /** Row id of the binding (`agx_agent_surface.id`). */
  bindingId: string;
  /** Surface this binding is for. */
  surfaceName: string;
  /** Variable / slot name whose mapping is broken. */
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
  /** Agent roles that exist in code manifests but not in DB. */
  roleManifestsMissingInDb: SurfaceAgentRoleDrift[];
  /** Agent roles that exist in DB but no longer in any code manifest. */
  dbRolesNotInManifest: SurfaceAgentRoleDrift[];
  /** Agent roles present in both but with diverging field values. */
  roleDiffs: SurfaceAgentRoleDrift[];
  /** Config namespaces referenced (manifest or `ui_surface_config`) without a registered handler. */
  unknownNamespaces: UnknownNamespace[];
  /** Broken `surface_value` mappings in `agx_agent_surface.value_mappings`. */
  brokenAgentMappings: BrokenMapping[];
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
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return false;
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
