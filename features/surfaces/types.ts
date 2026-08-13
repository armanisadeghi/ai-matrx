/**
 * Surface Values System — public TypeScript surface.
 *
 * A `SurfaceValue` is a named runtime value a UI surface declares it can
 * supply at execution time. Surfaces register a `SurfaceManifest` in code;
 * the registry is mirrored into `ui.ui_surface_value` so binding UIs
 * (agent mapping editors, tool mapping editors, audit views) can pick from
 * the same list the runtime actually emits.
 *
 * The `ValueMapping` discriminated union is the JSONB shape stored in
 * agent↔surface binding value_mappings (platform.associations edge metadata). A single resolver consumes it for
 * agent variables and agent context slots.
 *
 * See:
 *   - `features/surfaces/manifests/registry.ts`   (the registry)
 *   - `features/surfaces/utils/value-mapping-resolver.ts` (the resolver)
 *   - `features/surfaces/services/manifest-sync.service.ts` (drift + sync)
 */

import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { components } from "@/types/python-generated/api-types";

// ---------------------------------------------------------------------------
// SurfaceValue — schema for one named value a surface declares.
// ---------------------------------------------------------------------------

/** Logical type of a surface value. Most are stringified for LLMs at runtime. */
export type SurfaceValueType =
  "string" | "number" | "boolean" | "object" | "array" | "document";

// ---------------------------------------------------------------------------
// SurfaceValueGroup — canonical named grouping of a surface's values.
// ---------------------------------------------------------------------------

/**
 * A canonical, surface-authored group of values ("SEO Signals", "Captures").
 * Groups are the ONLY sanctioned way to organize values — no UI may invent its
 * own sections. Curated groups author sortOrder 0–899; the registry reserves
 * `general` (850), `inherited:<parent>` (9000+), and `baseline` (9900), which
 * manifests may NOT declare. Mirrored to `ui_surface.value_groups` (JSONB) and
 * per value to `ui_surface_value.group_key`.
 */
export interface SurfaceValueGroup {
  /** lower_snake_case, unique within the surface (e.g. `seo_signals`). */
  key: string;
  /** The ONE canonical human label for this group. */
  label: string;
  /** Display/curation order. Author band 0–899. */
  sortOrder: number;
  description?: string;
}

/** Reserved group keys synthesized by the registry — undeclarable in manifests. */
export const RESERVED_GROUP_KEYS = {
  general: "general",
  baseline: "baseline",
  inheritedPrefix: "inherited:",
} as const;

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

  /**
   * Whether this value is AUTOMATICALLY added to the agent's context when the
   * surface emits it at launch (true, the default), or only available for
   * explicit variable/context-slot mapping (false). The point of `false` is
   * signal-to-noise: a surface can declare 25 values so binding UIs offer
   * them, while auto-context stays limited to what an agent on this surface
   * genuinely needs (an id, the content, the cursor) — everything else is
   * "look it up if you need it". Mirrored to `ui_surface_value.auto_context`.
   */
  autoContext?: boolean;

  /** Optional sort order within the surface; defaults to 1000 in DB. */
  sortOrder?: number;

  /**
   * Key of the `SurfaceValueGroup` this value belongs to. Must reference a key
   * declared in the manifest's `groups`. Omitted = the implicit `general`
   * group. Never set to a reserved key (`general`, `baseline`, `inherited:*`).
   * Mirrored to `ui_surface_value.group_key`.
   */
  group?: string;
}

// ---------------------------------------------------------------------------
// Resolved manifest types — what the registry exports after inheritance +
// baseline injection. Additive supersets of the authored types, so every
// existing consumer of `SurfaceManifest` / `SurfaceValue` keeps compiling.
// ---------------------------------------------------------------------------

/** Where a resolved value came from. Preserved through registry resolution. */
export type SurfaceValueProvenance =
  | { kind: "own" }
  | { kind: "inherited"; from: string }
  | { kind: "baseline" };

export interface ResolvedSurfaceValue extends SurfaceValue {
  provenance: SurfaceValueProvenance;
  /** Always populated after resolution: curated key, `general`, `inherited:<parent>`, or `baseline`. */
  groupKey: string;
}

export interface ResolvedSurfaceManifest extends SurfaceManifest {
  values: readonly ResolvedSurfaceValue[];
  /**
   * Curated groups + synthesized auto groups (`general`, `inherited:<parent>`,
   * `baseline`), sorted by sortOrder — curated first, inherited next,
   * baselines last, by construction.
   */
  groups: readonly SurfaceValueGroup[];
}

// ---------------------------------------------------------------------------
// SurfaceAgentRole — a named agent position a surface uses.
// ---------------------------------------------------------------------------

/**
 * Declared in manifests, mirrored to `ui.ui_surface_agent_role` by
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
 * A config namespace the surface consumes from `ui.ui_surface_config`
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
// SurfaceEvidenceSource — automatic Document Evidence System activation.
// ---------------------------------------------------------------------------

/**
 * A processed-document pointer the surface guarantees it can derive from its
 * runtime values. The universal launcher turns this declaration into a lazy
 * `request.context` source before agent-variable mappings run, so document
 * tools/context do not depend on an agent author manually mapping an id.
 */
export interface SurfaceProcessedDocumentEvidenceSource {
  kind: "processed_document";
  /** Surface value containing `docproc.processed_documents.id`. */
  idValue: string;
  /** Optional surface value containing the originating `files.files.id`. */
  fileIdValue?: string;
  /** Optional surface value used as the agent-facing document label. */
  labelValue?: string;
  /** Preferred primary text representation; omitted means clean-when-ready. */
  representation?: "clean" | "raw";
}

export type SurfaceEvidenceSource = SurfaceProcessedDocumentEvidenceSource;

// ---------------------------------------------------------------------------
// SurfaceWriteTarget — a named write path INTO the surface (read/write v1).
// ---------------------------------------------------------------------------

/**
 * A named field/state the surface declares agents (and agent-result
 * components) may WRITE into — the write half of the manifest, beside the
 * read-only `values`. Declared in code and consumed by the surface-writeback
 * runtime (`features/surfaces/runtime/surface-writeback.ts`): the page
 * registers a handler per target on its `SurfaceRuntimeProvider`, and any
 * caller (a kind-component action button, an automated envelope apply) goes
 * through `applySurfaceWrite(target, value)` — never a bespoke callback.
 *
 * Code-only in v1 (like `evidenceSources`): not yet mirrored to the DB.
 * Mirroring (so server-side agents can see what a surface accepts) is the
 * planned follow-up once the client seam is proven.
 */
export interface SurfaceWriteTarget {
  /** lower_snake_case, unique within the surface (same regex as values). */
  name: string;
  /** The ONE canonical human label ("Node brief"). THE NAMING LAW applies. */
  label: string;
  /**
   * What applying this target DOES — where the value lands, what shape it
   * must be, and whether the user still has to confirm/save. 1-3 sentences.
   */
  description: string;
  /** Shape of the value a caller must pass. */
  valueType: SurfaceValueType;
  /**
   * The declared SurfaceValue this target updates, when there is a 1:1 read
   * twin — the evidence loop (read the value, write the target). Omit for
   * pure-action targets with no read twin.
   */
  updatesValue?: string;
  /**
   * Where the write lands:
   * - `"draft"`  — staged into the page's editor/draft state; the USER still
   *   reviews and saves. The preferred default (additive, reversible).
   * - `"entity"` — persisted immediately through the page's canonical write
   *   path (service → DB). Reserve for writes that are safe to land directly.
   * - `"ui"`     — ephemeral UI state only (selection, view focus); nothing
   *   is persisted and nothing needs saving.
   */
  mode: "draft" | "entity" | "ui";
  /**
   * Who may apply this target WITHOUT a human in the loop.
   *
   * A user clicking a declared control is always allowed — the click IS the
   * consent. This axis governs an AGENT-originated write (`origin: "agent"` on
   * `applySurfaceWrite`), which is the direction that turns "agents can read
   * the page" into "agents can change the page":
   *
   * - `"manual"` (DEFAULT, and deliberately so) — agent-originated writes are
   *   REFUSED, loudly. The target exists for user-driven controls only. A new
   *   target starts here: nothing becomes agent-writable by omission.
   * - `"ask"` — the user is asked, in place, naming the target and what lands.
   *   Decline is a normal outcome, not an error. This is the right setting for
   *   almost everything that changes what the user sees.
   * - `"auto"` — applied immediately. Justify it: appropriate for `ui` mode
   *   (moving a selection is cheap and visible) and for `draft` mode where the
   *   user still reviews before saving. An `entity` target on `"auto"` means an
   *   agent silently writes the database — do not set that without a reason
   *   written in `description`.
   */
  applyPolicy?: "manual" | "ask" | "auto";
  /** Key of a declared SurfaceValueGroup (same rules as SurfaceValue.group). */
  group?: string;
  sortOrder?: number;
}

// ---------------------------------------------------------------------------
// SurfaceClientTool — a client-side TOOL the surface offers to bound agents.
// ---------------------------------------------------------------------------

/**
 * The wire contract for a surface client tool's arguments — the exact JSON
 * Schema shape aidream's `InlineToolSpec.input_schema` accepts
 * (`{type:"object", properties, required}`). Generated type, never widened.
 */
export type SurfaceClientToolInputSchema =
  components["schemas"]["CustomToolInputSchema"];

/**
 * A client-side tool this surface offers to agents bound to it — the ACTION
 * half of the 360 loop, beside `writeTargets` (the data-write half). Declared
 * in code; the page registers one handler per tool via `useSurfaceClientTools`
 * (`runtime/SurfaceRuntimeContext.tsx`); execution lands through
 * `executeSurfaceClientTool` (`runtime/surface-client-tools.ts`).
 *
 * At launch, every declared+mounted+handled tool is emitted on the request as
 * a `ToolSpecInline` (`kind:"inline"` — the supported way to offer a
 * client-delegated tool the server has no registry entry for), so the agent
 * can call it; the `tool_delegated` event routes back to the page's handler.
 *
 * Mirrored to `ui.ui_surface_client_tool` by `manifest-sync.service.ts`, so
 * server-side agents can see a surface's action vocabulary (the inline specs
 * themselves are assembled on the client at launch). Code stays truth.
 */
export interface SurfaceClientTool {
  /**
   * lower_snake_case, unique within the surface (same regex as values). This
   * is the model-facing tool name — it must also satisfy the server's tool
   * name rule (`[a-zA-Z0-9_:-]{1,64}`). Prefix with the surface's domain
   * (e.g. `content_plan_focus_node`) — the tool namespace is global per
   * conversation, and a collision with a registered/widget tool name is
   * silently skipped at injection time.
   */
  name: string;
  /** The ONE canonical human label ("Focus node"). THE NAMING LAW applies. */
  label: string;
  /**
   * What the AGENT is told — when to call it, what it does on the page, and
   * what the result means. This is model-facing prose, not UI copy.
   */
  description: string;
  /** JSON Schema for the tool's arguments — the wire contract. */
  inputSchema: SurfaceClientToolInputSchema;
  /**
   * What calling it does to the page — same meanings as
   * `SurfaceWriteTarget.mode`: `"ui"` (ephemeral view/selection state),
   * `"draft"` (staged into editor state; the user still saves), `"entity"`
   * (persisted immediately through the page's canonical write path).
   * Omitted = `"ui"` is the safe reading.
   */
  mode?: SurfaceWriteTarget["mode"];
}

// ---------------------------------------------------------------------------
// SurfaceManifest — what a single surface declares.
// ---------------------------------------------------------------------------

/**
 * Where a surface stands on the road to "verified correct and complete".
 * REQUIRED on every manifest — the platform's tracking of the canonicalization
 * campaign. Mirrored to `ui_surface.readiness`; DB rows with no manifest are
 * implicitly `unregistered` (never declared in code).
 *
 * - `verified` — full completeness audit done: every piece of page data
 *   declared (fields + natural composites), groups curated, emitter wired and
 *   live-checked. The end state.
 * - `partial`  — real manifest + emitter exist but known gaps remain
 *   (un-audited values, missing groups, or an incomplete emitter).
 * - `stub`     — placeholder vocabulary; never audited against the page.
 */
export type SurfaceReadiness = "verified" | "partial" | "stub";

export interface SurfaceManifest {
  /** Matches `ui_surface.name`. */
  surfaceName: string;
  /**
   * Campaign tracking — REQUIRED. See `SurfaceReadiness`. Only flip to
   * `verified` after the surface-authoring checklist passes end-to-end.
   */
  readiness: SurfaceReadiness;
  /** One line on what is missing (required when readiness != "verified"). */
  readinessNote?: string;
  /**
   * For OVERLAY/WINDOW surfaces (no route of their own): the overlay id from
   * `features/window-panels/registry/overlay-ids.ts` this surface belongs to.
   * Identifies the surface's home unambiguously (the overlay twin of
   * `urlPattern`). Mirrored to `ui_surface.overlay_id`.
   */
  overlayId?: string;
  /**
   * The ONE canonical human display name for this surface (e.g.
   * "PDF Extractor"). REQUIRED — this exact string is used byte-identically
   * everywhere (chrome, windows, admin, binding UIs); free-text overrides are
   * prohibited. Mirrored to `ui_surface.label` by manifest sync. Derive via
   * `getSurfaceDisplayLabel` in `features/surfaces/utils/surface-display.ts`.
   */
  label: string;
  /**
   * Canonical route for this surface (e.g. `/notes`, `/agents/builder`,
   * `/transcripts/scribe/:sessionId`). Mirrored to `ui_surface.url_pattern`
   * by manifest sync. When omitted, sync derives a default from the route
   * map or a simple client/local heuristic.
   */
  urlPattern?: string;
  /**
   * Parent surface this one inherits from (surface inheritance v1). The child
   * inherits the parent's values, agent roles, config namespaces, AND agent
   * bindings (parent binding layers apply weakest — child wins per key in the
   * launch-time merge). Must name a registered manifest; cycles and chains
   * deeper than the registry's depth cap throw loudly at registry init.
   * Mirrored to `ui_surface.parent_surface_name` by manifest sync.
   */
  inheritsFrom?: string;
  /**
   * The surface's self-introduction to the agent — a single XML-ish context
   * block (`<surface_intro>…`) explaining what this surface IS, what the user
   * does here, and how to interpret the values it emits. Written by the
   * manifest author who understands the surface's purpose; becomes the first
   * surface-context item the agent sees. Mirrored to `ui_surface.intro`.
   */
  intro?: string;
  /** Flat list of SurfaceValues this surface declares. */
  values: readonly SurfaceValue[];
  /**
   * Canonical value groups this surface curates. Every `SurfaceValue.group`
   * must reference one of these keys. Reserved keys (`general`, `baseline`,
   * `inherited:*`) are synthesized by the registry and may not be declared.
   * Mirrored to `ui_surface.value_groups` by manifest sync.
   */
  groups?: readonly SurfaceValueGroup[];
  /** Agent positions this surface uses. Mirrored to ui_surface_agent_role. */
  agentRoles?: readonly SurfaceAgentRole[];
  /** Config namespaces this surface consumes (code-only declaration). */
  configNamespaces?: readonly SurfaceConfigNamespaceDecl[];
  /**
   * Declarative inputs to the Document Evidence System. These are launch
   * contracts, not bindable values and therefore are not mirrored to the DB.
   * They inherit with the rest of the surface manifest.
   */
  evidenceSources?: readonly SurfaceEvidenceSource[];
  /**
   * The WRITE half of the surface (read/write manifests v1): named targets
   * agent results and kind-component actions may write into via the
   * surface-writeback runtime. Code-only for now (not mirrored to the DB).
   * A declared target with no registered runtime handler fails LOUDLY at
   * apply time — never silently.
   */
  writeTargets?: readonly SurfaceWriteTarget[];
  /**
   * Client-side TOOLS this surface offers to bound agents (the action half of
   * the 360 loop). Declared+mounted+handled tools are injected as inline
   * specs at launch and executed on the page via the surface client-tool
   * runtime (`runtime/surface-client-tools.ts`). A declared tool with no
   * registered handler is NOT offered to the agent (and a delegated call to
   * one fails LOUDLY) — never silently. Mirrored to
   * `ui.ui_surface_client_tool`; a row there means DECLARED, not live.
   *
   * Tool names are GLOBAL per conversation, not per surface —
   * `check:surface-drift` enforces cross-surface uniqueness, because a
   * collision with an already-present spec is silently skipped at injection.
   */
  clientTools?: readonly SurfaceClientTool[];
  /**
   * Opt out of the automatic generic-baseline injection (`selection`,
   * `text_before`, `text_after`, `content`, `context`) performed in
   * `registry.ts`. Set ONLY for a surface that genuinely has no
   * text/content/selection concept (a metadata-only widget). Almost never
   * used — the generic baselines are what let an agent author bind to a
   * universal value on any surface, so dropping them makes a surface invisible
   * to every generic agent.
   */
  skipBaselineValues?: boolean;
}

// ---------------------------------------------------------------------------
// ValueMapping — the JSONB shape that lives on bindings.
// ---------------------------------------------------------------------------

/** Map types v1. Adding a new type is a TS branch + resolver case; no SQL changes. */
/**
 * A binding's per-target override of a write target's `applyPolicy`.
 *
 * Precedence (weakest → strongest): the SURFACE's per-target default
 * (`SurfaceWriteTarget.applyPolicy`) → binding layers in the same order value
 * mappings merge (global → org → user → shortcut). The user controls this
 * wherever they bind — a shortcut is just the most opinionated binding layer,
 * never a different system.
 */
export type SurfaceWritePolicy = "manual" | "ask" | "auto";

/** target name → policy override. Stored in the surface_binding payload (v2). */
export type WritePolicyMap = Record<string, SurfaceWritePolicy>;

export function isSurfaceWritePolicy(v: unknown): v is SurfaceWritePolicy {
  return v === "manual" || v === "ask" || v === "auto";
}

/**
 * Keep only well-formed `target → policy` entries from an untrusted JSONB
 * blob; junk entries degrade to absent. The ONE sanitizer for every
 * WritePolicyMap read path (binding edge payload, shortcut storage).
 */
export function sanitizeWritePolicyMap(raw: unknown): WritePolicyMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: WritePolicyMap = {};
  for (const [target, policy] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (isSurfaceWritePolicy(policy)) out[target] = policy;
  }
  return out;
}

export type ValueMappingType =
  "surface_value" | "direct_value" | "prompt_user" | "unmapped";

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
    Record<
      keyof SurfaceValue | "groupKey",
      { manifest: unknown; db: unknown }
    >
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

/**
 * Single drift entry for a SurfaceWriteTarget not synced between code and DB.
 *
 * The WRITE half of the manifest is mirrored to `ui.ui_surface_write_target`
 * so server-side agents can see what a surface ACCEPTS. That mirror can go
 * stale exactly like the value mirror — a branch syncs targets its manifest
 * declares, the branch never lands, and the rows outlive the code. Reporting
 * them is what lets an admin decide; the alternative (a global `deleteStale`
 * sweep) is indiscriminate and deletes rows belonging to unmerged work.
 */
export interface SurfaceWriteTargetDrift {
  surfaceName: string;
  targetName: string;
  /** `manifest_only` = code has it, DB doesn't. `db_only` = DB has it, code doesn't. `diff` = both have it but fields differ. */
  kind: "manifest_only" | "db_only" | "diff";
  /** Field-level diff when `kind === "diff"`. */
  diff?: Partial<
    Record<
      keyof SurfaceWriteTarget | "groupKey",
      { manifest: unknown; db: unknown }
    >
  >;
}

/** Single drift entry for a SurfaceClientTool not synced between code and DB. */
export interface SurfaceClientToolDrift {
  surfaceName: string;
  toolName: string;
  /** `manifest_only` = code has it, DB doesn't. `db_only` = DB has it, code doesn't. `diff` = both have it but fields differ. */
  kind: "manifest_only" | "db_only" | "diff";
  /** Field-level diff when `kind === "diff"`. */
  diff?: Partial<
    Record<keyof SurfaceClientTool, { manifest: unknown; db: unknown }>
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
  /** Row id of the binding (binding association id). */
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

/** Single drift entry for `ui_surface.url_pattern` not synced from code. */
export interface SurfaceUrlPatternDrift {
  surfaceName: string;
  kind: "missing_in_db" | "diff";
  /** Resolved from manifest + route map. */
  manifest: string;
  /** Current DB value (null when missing). */
  db: string | null;
}

/** Drift for `ui_surface.label` / `ui_surface.value_groups` vs the resolved manifest. */
export interface SurfaceLabelDrift {
  surfaceName: string;
  kind: "missing_in_db" | "diff";
  manifest: string;
  db: string | null;
}

export interface SurfaceValueGroupsDrift {
  surfaceName: string;
  kind: "missing_in_db" | "diff";
  manifest: readonly SurfaceValueGroup[];
  db: unknown;
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
  /** Write targets that exist in code manifests but not in DB. */
  writeTargetManifestsMissingInDb: SurfaceWriteTargetDrift[];
  /** Write targets that exist in DB but no longer in any code manifest. */
  dbWriteTargetsNotInManifest: SurfaceWriteTargetDrift[];
  /** Write targets present in both but with diverging field values. */
  writeTargetDiffs: SurfaceWriteTargetDrift[];
  /** Client tools that exist in code manifests but not in DB. */
  clientToolManifestsMissingInDb: SurfaceClientToolDrift[];
  /** Client tools that exist in DB but no longer in any code manifest. */
  dbClientToolsNotInManifest: SurfaceClientToolDrift[];
  /** Client tools present in both but with diverging field values. */
  clientToolDiffs: SurfaceClientToolDrift[];
  /** Config namespaces referenced (manifest or `ui_surface_config`) without a registered handler. */
  unknownNamespaces: UnknownNamespace[];
  /** Broken `surface_value` mappings in agent↔surface binding value_mappings (platform.associations edge metadata). */
  brokenAgentMappings: BrokenMapping[];
  /** Surfaces whose `ui_surface.url_pattern` differs from code defaults. */
  urlPatternDrifts: SurfaceUrlPatternDrift[];
  /** Surfaces whose `ui_surface.label` differs from the canonical manifest label. */
  surfaceLabelDrifts: SurfaceLabelDrift[];
  /** Surfaces whose `ui_surface.value_groups` differs from the resolved manifest groups. */
  valueGroupsDrifts: SurfaceValueGroupsDrift[];
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
