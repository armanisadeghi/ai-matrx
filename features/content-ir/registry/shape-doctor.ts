/**
 * Shape doctor — the completeness + drift checker for the Shape System
 * (SHAPE_SYSTEM.md R10: status is GENERATED, never hand-maintained).
 *
 * Computes, per kind, the status of every asset in the 7-asset model
 * (schema · example · recomputed structural gate · component · skill ·
 * content block · detection surface) plus a list of global findings —
 * red screamers (schema drifted under an ACTIVE kind's sample, duplicate
 * skills, components on schemaless kinds) and yellow gaps (no example /
 * skill / content block, stale examples, detector tokens with no
 * `kind_surface` row — expected until Stage 5).
 *
 * PURE with injected deps, mirroring `kind-dual-gate.ts`: the caller
 * (scripts/shape/check-shapes.ts) does ALL I/O — DB reads, detector-file
 * text extraction, code-registry scans — and hands rows in. No supabase,
 * React, or fs imports here, so this runs in the CLI, in CI, and in a
 * browser admin board alike.
 *
 * The structural gate is RECOMPUTED via the dual gate's own exported leg
 * (`validateStructuralLeg`) — stored `validation_status` / `is_active` are
 * never trusted (a fabricated 'passed' is exactly the defect this catches).
 *
 * ─── The `n/a` doctrine (R10: the board's job is to make REAL gaps obvious) ──
 *
 * A yellow that can never be satisfied is noise, and noise erodes trust in the
 * board. Two classes of kind are STRUCTURALLY incapable of holding some of the
 * 7 assets, so those cells are `n/a` (not `missing`) and emit NO finding:
 *
 *   1. `data_only` — `metadata.family === 'workflow_io'`. Workflow node I/O
 *      contracts (`json`, `text`, `http_response`, `map_result`, …). They are
 *      data passed between nodes, never rendered and never emitted by an agent
 *      as content: component / surface / skill / content_block are meaningless.
 *
 *   2. `nested_only_child` — referenced as a `kind_edge.child_definition_id` by
 *      some OTHER kind, and owning no component, no surface, and no compiled
 *      render path, and INACTIVE. It renders only inside its root (`flashcard`
 *      inside `flashcard_set`, `timeline_event` inside `timeline_period`, …).
 *      It cannot arrive standalone at a detector, cannot resolve standalone at
 *      the component seam, and its shape is taught by its parent's skill/block.
 *
 * Three rules keep this HONEST rather than a suppression switch:
 *
 *   (a) `n/a` NEVER overwrites a positive. It only replaces what would have
 *       been `missing`/`warn`. So a nested child that IS taught (its `__kind`
 *       appears inside its parent's skill body) still reads `ok`, and every RED
 *       — all of which are PRESENCE-driven (a component row on a schemaless
 *       kind, two skills on one kind/syntax, a failing recomputed gate on an
 *       ACTIVE kind, duplicate/drift) — fires exactly as before.
 *
 *   (b) `definition`, `example` and `gate_structural` are NEVER exemptible
 *       (see `EXEMPTIBLE_COLUMNS`). A child kind's `kind_example` row is what
 *       the recomputed structural gate validates its schema against; without
 *       one the schema is unproven. RATIFIED 2026-07-15 (Arman): EVERY kind
 *       must carry a canonical example — nested-only children included; this
 *       is policy, not aspiration. `no-example` fires when a kind has no
 *       example at all, and `no-canonical-example` fires when it subsists on
 *       non-canonical examples or interim `sample_data` — both yellows exist
 *       so a regression from the every-kind-has-an-example state goes LOUD
 *       instead of hiding in a silent warn cell.
 *
 *   (c) `is_active` is the escape hatch for class 2. Per R6 an ACTIVE kind
 *       asserts standalone render-trust at the resolver seam, so it is never
 *       exempted — `quiz_set` is nested inside `study_pack_set` yet is an
 *       ACTIVE root, and its missing component is a genuine gap that must stay
 *       loud. Self-recursive edges (`decision_node.yes → decision_node`) are
 *       likewise not evidence of nesting.
 *
 * Every exemption is DERIVED, never declared: register a surface, a component,
 * or activate the kind, and the `n/a` evaporates and the yellows come back.
 */

import { validateStructuralLeg } from "@ai-matrx/content-ir";

// ─── Asset columns (v1) ─────────────────────────────────────────────────────

export const ASSET_COLUMNS = [
  "definition",
  "example",
  "gate_structural",
  "component",
  "loading",
  "skill",
  "content_block",
  "surface",
] as const;
export type AssetColumn = (typeof ASSET_COLUMNS)[number];

/**
 * `n/a` = structurally inapplicable to this kind (see the doctrine block above).
 * Distinct from `missing` (a real, closeable gap) and `warn` (a soft gap).
 */
export type AssetStatus = "ok" | "warn" | "missing" | "n/a";

export const ASSET_STATUSES = ["ok", "warn", "missing", "n/a"] as const;

/**
 * The ONLY cells an exemption may mark `n/a`. `definition`, `example` and
 * `gate_structural` are deliberately absent — a kind that cannot prove its
 * schema against a sample is a real gap whether or not it renders standalone.
 */
export const EXEMPTIBLE_COLUMNS: ReadonlySet<AssetColumn> = new Set<AssetColumn>([
  "component",
  "loading",
  "surface",
  "skill",
  "content_block",
]);

/** `kind_definition.metadata.family` marking a workflow node I/O contract. */
export const WORKFLOW_IO_FAMILY = "workflow_io";

/**
 * The four generated framed-contract families published by aidream's
 * `scripts/sync_content_ir_contracts.py`. All are DATA-ONLY contracts —
 * values passed through framed protocols (tool calls, workflow edges, action
 * I/O, structured agent outputs), never emitted as display content — so their
 * render-asset cells (component / surface / skill / content_block) are `n/a`.
 * `definition` / `example` / `gate_structural` stay fully enforced.
 */
/**
 * A machine-minted I/O contract slug: `<family>_<source>_<sha8>_<direction>`
 * (matrx-graph `contract_kinds.contract_kind_slug`). This — not
 * `metadata.family` — is what tells a generated contract apart from a curated
 * Shape, because real shapes may legitimately sit in the same families.
 */
export const CONTRACT_SLUG_RE =
  /^(?:action_io|tool_io|workflow_io|agent_io)_.+_[0-9a-f]{8}_(?:input|output)$/;

export const GENERATED_CONTRACT_FAMILIES: ReadonlySet<string> = new Set([
  "action_io",
  "tool_io",
  WORKFLOW_IO_FAMILY,
  "agent_io",
]);

/**
 * XML tags that are protocol/control machinery, NOT Shapes — code-owned per
 * SHAPE_SYSTEM.md R2. The detector census must exclude them (they will never
 * get a `kind_surface` row). Exported so the CLI's extraction and any future
 * consumer share ONE list.
 */
export const CONTROL_TAGS: ReadonlySet<string> = new Set([
  "thinking",
  "think",
  "reasoning",
  "info",
  "task",
  "database",
  "private",
  "plan",
  "event",
  "tool",
]);

// ─── Injected inputs ────────────────────────────────────────────────────────

export interface DoctorKindDefinition {
  id: string;
  kind: string;
  label: string;
  isActive: boolean;
  /** content_ir.kind_definition.emitted_json_schema (null = no schema). */
  emittedJsonSchema: unknown;
  /** Interim kind_definition.sample_data (R4: migrates to kind_example, then DROPS). */
  sampleData: unknown;
  /** ISO timestamp — used for the stale-example comparison. */
  updatedAt: string;
  /** content_ir.kind_definition.metadata jsonb — read for `family` (data-only classing). */
  metadata: unknown;
}

/**
 * One `content_ir.kind_edge` row — the parent→child nesting graph. Required
 * (never optional): without it the doctor cannot tell a nested-only child from
 * a root with a missing component, and would silently report the CLI's answer
 * differently from the admin board's.
 */
export interface DoctorKindEdge {
  parentDefinitionId: string;
  childDefinitionId: string;
  fieldName: string;
}

export interface DoctorKindExample {
  id: string;
  kindDefinitionId: string;
  isCanonical: boolean;
  data: unknown;
  updatedAt: string;
}

export interface DoctorKindComponent {
  id: string;
  kindDefinitionId: string;
  platform: string;
  role: string;
  componentKey: string;
  /** `bundled` (the key must resolve in the host's dispatch table) or `db`
   * (the key is a LABEL — the row's own `component_source` is compiled
   * in-page, so it never reaches dispatch). */
  source: string;
  isActive: boolean;
}

export interface DoctorKindSurface {
  id: string;
  kindDefinitionId: string;
  surfaceType: string;
  token: string;
  /** kind_surface.is_active — inactive surfaces are exempt from the
   * host-detectability reconciliation (a deactivated surface SHOULD be
   * undetectable via the generated bootstrap). */
  isActive: boolean;
}

export interface DoctorRenderBlockSkill {
  /** skill.definition.skill_id (skill_type='render_block', live rows only). */
  skillId: string;
  label: string;
  body: string | null;
}

export interface DoctorContentBlock {
  id: string;
  template: string;
}

/** One token found in a frozen detector literal (accumulator / splitter-v2). */
export interface DoctorDetectorToken {
  token: string;
  /** 'xml_tag' | 'json_root' — informational, from which literal it came. */
  surfaceType: string;
  /** Which file/literal produced it (for the finding message). */
  source: string;
}

/**
 * The R6 generic fallback's key — a `kind_component` row may legitimately name
 * it, and the route handles it explicitly (`generic-row`), so it is never a
 * dangling dispatch key. Mirrors GENERIC_STRUCTURED_COMPONENT_KEY in
 * @ai-matrx/content-ir-react (not imported: this module stays dependency-free).
 */
const GENERIC_STRUCTURED_KEY = "generic_structured";

export interface DoctorCodeRenderPaths {
  /** Kinds with a compiled bridge/component facet (system-kinds.ts). */
  compiledKinds: string[];
  /** Kinds referenced by artifact-type-registry `kinds:` facades. */
  artifactKinds: string[];
  /**
   * Every block type `resolveBlockDispatch` can answer (block-dispatch.tsx,
   * via `extractDispatchKeysFromText`). When provided, every ACTIVE
   * `source='bundled'` web/output `kind_component` row's key MUST appear here
   * — a miss is a RED `dangling-component-key`. Omit only when the source is
   * unreadable; the caller then loses the check and must say so.
   */
  dispatchKeys?: readonly string[];
}

/** One aidream generated-contract manifest entry (slim view the doctor needs). */
export interface DoctorContractManifestEntry {
  kind: string;
  family: string;
}

export interface ShapeDoctorInput {
  kinds: DoctorKindDefinition[];
  examples: DoctorKindExample[];
  components: DoctorKindComponent[];
  surfaces: DoctorKindSurface[];
  edges: DoctorKindEdge[];
  renderBlockSkills: DoctorRenderBlockSkill[];
  contentBlocks: DoctorContentBlock[];
  detectorTokens: DoctorDetectorToken[];
  codeRenderPaths: DoctorCodeRenderPaths;
  /**
   * All classified names from the generated content-vocab crosswalk
   * (scripts/shape/content-vocab-crosswalk.json). When provided, every kind
   * slug, non-control detector token, and surface token the doctor sees MUST
   * appear here — a miss is a RED `vocab-unclassified` finding. Omit only in
   * legacy callers that cannot load the crosswalk (they lose the gate).
   */
  crosswalkNames?: ReadonlySet<string>;
  /**
   * The detection HOSTS' full token surface per surface type (extracted via
   * `extractHostSurfaceTokensFromTexts`). When provided, every ACTIVE
   * `kind_surface` row of a host-covered surface type must have its token in
   * the matching host set — a miss is a RED `surface-token-undetectable`
   * (registry says the surface exists; no host literal can ever fire it).
   * Wave 1 C2: the generated bootstrap and the hand-coded host literals must
   * agree until the Wave-2 ratchet deletes the literals.
   */
  hostSurfaceTokens?: {
    xml_tag: ReadonlySet<string>;
    fence_lang: ReadonlySet<string>;
    json_root_key: ReadonlySet<string>;
  };
  /**
   * The hardcoded loading-library slugs (KIND_LOADING_SLUGS,
   * react/loading/kind-loading-slugs.ts). When provided, a declared
   * `loading_component` naming a slug outside this set is a RED
   * `unknown-loading-component` — the registry claims a loader that does not
   * exist. Since 2026-08-25 the runtime IGNORES it and derives a silhouette
   * from the kind's own schema instead, so the declaration is dead weight
   * pointing at nothing — still a defect, just no longer a downgrade.
   * Omit only in a caller that cannot load the list (it loses the check).
   */
  loadingLibrarySlugs?: ReadonlySet<string>;
  /**
   * Compiled per-kind `loadingComponent` declarations (kind slug → loader
   * slug), extracted from system-kinds.ts + kinds/*.ts TEXT. Compiled
   * definitions win at runtime (`kindRegistry.getDefinition`), so a compiled
   * declaration satisfies the loading cell exactly like a DB
   * `metadata.loading_component` does.
   */
  compiledLoadingSlugs?: ReadonlyMap<string, string>;
  /**
   * DERIVED per-kind loading slugs (kind slug → the slug the RUNTIME would
   * infer from that kind's own schema, react/loading/infer-loading-slug.ts).
   * The doctor stays PURE exactly like `compiledLoadingSlugs` /
   * `loadingLibrarySlugs`: it never reads a schema to derive anything — the
   * caller runs the real inference module and hands the answer in, so the CLI
   * and the admin board can never derive two different answers.
   *
   * An undeclared kind that DERIVES a slug is not a gap: at runtime it streams
   * behind a shape-appropriate loader (precedence: declaration → derivation →
   * `generic`), so its cell is `ok` and it raises no finding. Only a kind whose
   * shape derives NOTHING truly falls to the shapeless generic skeleton — that
   * is what `no-loading-component` now means.
   *
   * Omit only in a caller that cannot run the inference; every undeclared
   * renderable kind then reports the pre-inference yellow (over-reporting, not
   * under-reporting).
   */
  inferredLoadingSlugs?: ReadonlyMap<string, string>;
}

// ─── Report shape ───────────────────────────────────────────────────────────

export interface AssetCell {
  status: AssetStatus;
  /** One-line human context — shown in markdown notes, kept OUT of the snapshot. */
  detail?: string;
}

/** Why a kind's exemptible cells are `n/a`. See the doctrine block above. */
export type ExemptionClass = "data_only" | "nested_only_child";

export interface KindExemption {
  class: ExemptionClass;
  /** Noun phrase naming the kind's structural role — the `n/a` detail prefix. */
  subject: string;
  /** Parent kind slugs (nested_only_child only), sorted; empty for data_only. */
  parents: string[];
}

export interface ShapeKindRow {
  kind: string;
  label: string;
  isActive: boolean;
  /** kind_definition.metadata.family (null when absent) — drives report grouping. */
  family: string | null;
  assets: Record<AssetColumn, AssetCell>;
  /** Non-null when this kind's exemptible cells are structurally `n/a`. */
  exemption: KindExemption | null;
}

export type FindingSeverity = "red" | "yellow";

export type FindingCode =
  // red
  | "active-gate-fail"
  | "duplicate-skill"
  | "component-without-schema"
  | "dangling-component-key" // a bundled kind_component key resolveBlockDispatch lacks
  | "detector-extract-failed" // emitted by the CLI when a frozen literal vanished
  | "snapshot-drift" // emitted by the CLI on committed-vs-live drift
  | "vocab-unclassified" // a kind/detector/surface name missing from the crosswalk
  | "contract-gap" // manifest ↔ live catalog mismatch for a generated contract family
  | "coverage-input-missing" // emitted by the CLI when crosswalk/manifest snapshot is unreadable
  | "surface-token-undetectable" // an ACTIVE kind_surface token no host literal can fire
  | "unknown-loading-component" // declared loading_component slug is not in the loading library
  | "manual-data-only-flag" // metadata.data_only key on a row — eradicated 2026-08-27, must never return
  // yellow
  | "no-loading-component" // renderable kind: no declared loader AND its shape derives none (generic fallback)
  | "no-example"
  | "no-canonical-example" // example exists but none is canonical / only interim sample_data
  | "no-skill"
  | "no-content-block"
  | "stale-example"
  | "detector-token-unregistered";

export interface ShapeFinding {
  severity: FindingSeverity;
  code: FindingCode;
  kind?: string;
  message: string;
}

export interface ShapeDoctorReport {
  /** One row per kind, sorted by kind slug. */
  rows: ShapeKindRow[];
  /** Reds first, then yellows; stable order within severity. */
  findings: ShapeFinding[];
  totals: {
    kinds: number;
    red: number;
    yellow: number;
    cells: Record<AssetStatus, number>;
  };
}

// ─── Skill → kind attribution ───────────────────────────────────────────────

export interface SkillTeaching {
  skillId: string;
  kind: string;
  /** R9: one skill per kind per syntax — `kind_<slug>` (json) / `kind_<slug>_xml`. */
  syntax: "json" | "xml";
}

const KIND_KEY_IN_BODY = /"__kind"\s*:\s*"([a-z0-9_]+)"/g;

/**
 * Which kind(s) does a render_block skill teach?
 *
 * 1. STRONG signal — the body demonstrates the canonical form: every
 *    `"__kind": "<slug>"` occurrence whose slug is a known kind. (This is the
 *    KEYSTONE: a skill teaches a Shape by teaching its canonical `__kind`
 *    JSON.) Syntax = json.
 * 2. CONVENTION signal — R9 naming: skill_id `kind_<slug>` → json,
 *    `kind_<slug>_xml` → xml (hyphens normalized to underscores).
 *
 * Deliberately NOT matched: loose skill_id ≈ kind-slug similarity. Legacy
 * skills that teach legacy root-key/XML forms without ever showing `__kind`
 * (e.g. `item-presentation` next to `item-presentation-kind`) are the
 * sanctioned coexist-not-clobber transition state — counting them would make
 * the duplicate-skill screamer fire on a ruling-compliant DB.
 */
export function attributeSkillsToKinds(
  skills: DoctorRenderBlockSkill[],
  knownKinds: ReadonlySet<string>,
): SkillTeaching[] {
  const teachings: SkillTeaching[] = [];
  const seen = new Set<string>();
  const add = (skillId: string, kind: string, syntax: "json" | "xml") => {
    const key = `${skillId} ${kind} ${syntax}`;
    if (seen.has(key)) return;
    seen.add(key);
    teachings.push({ skillId, kind, syntax });
  };

  for (const skill of skills) {
    // 1. Body `__kind` slugs.
    for (const match of (skill.body ?? "").matchAll(KIND_KEY_IN_BODY)) {
      const slug = match[1];
      if (knownKinds.has(slug)) add(skill.skillId, slug, "json");
    }
    // 2. R9 skill_id convention.
    const normalized = skill.skillId.replace(/-/g, "_");
    const conventional = /^kind_([a-z0-9_]+?)(_xml)?$/.exec(normalized);
    if (conventional && knownKinds.has(conventional[1])) {
      add(skill.skillId, conventional[1], conventional[2] ? "xml" : "json");
    }
  }
  return teachings;
}

// ─── Exemption classing (`n/a`) ─────────────────────────────────────────────

/** `metadata.family`, defensively — jsonb arrives as `unknown`. */
export function kindFamily(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const family = (metadata as Record<string, unknown>).family;
  return typeof family === "string" ? family : null;
}

/** `metadata.loading_component`, defensively — jsonb arrives as `unknown`. */
export function kindLoadingComponent(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const slug = (metadata as Record<string, unknown>).loading_component;
  return typeof slug === "string" && slug.length > 0 ? slug : null;
}

/**
 * THE SKILL-OWNER DECLARATION — the resolution mechanism for `duplicate-skill`.
 *
 * R9 is ONE skill per kind per syntax. In practice the violation is almost never
 * two rival skills for one shape: it is a CONTAINER kind's skill demonstrating
 * the ITEM kinds it embeds (`kind_ner_canonicalization_result` shows an
 * `ner_entity_ref` inside its payload, so the attribution pass counts it as
 * teaching `ner_entity_ref` too). Deleting a skill would be the wrong repair —
 * the container legitimately needs to show its children.
 *
 * So the resolution is a DECLARATION, not a deletion: the kind names the skill
 * that OWNS teaching it. Every other skill that mentions it is then, by that
 * declaration, merely embedding it.
 *
 * Stored at `content_ir.kind_definition.metadata.skill_owner`:
 *
 *   { "json": { "skill_id": "kind_ner_entity_ref",
 *               "decided_by": "<uuid>", "decided_at": "<iso>", "note": "…" } }
 *
 * A bare string (`{"json": "kind_ner_entity_ref"}`) is accepted too.
 *
 * FALSIFIABILITY: a declaration only silences the red while it is TRUE. If the
 * named skill stops teaching the kind, the declaration is stale and the red
 * comes back with a message saying so — a resolution that cannot go wrong again
 * would be a resolution that cannot be checked.
 */
export function kindSkillOwner(
  metadata: unknown,
  syntax: "json" | "xml",
): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return null;
  }
  const owner = (metadata as Record<string, unknown>).skill_owner;
  if (typeof owner !== "object" || owner === null || Array.isArray(owner)) {
    return null;
  }
  const entry = (owner as Record<string, unknown>)[syntax];
  if (typeof entry === "string") return entry.length > 0 ? entry : null;
  if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
    const skillId = (entry as Record<string, unknown>).skill_id;
    return typeof skillId === "string" && skillId.length > 0 ? skillId : null;
  }
  return null;
}

export interface ExemptionEvidence {
  kind: DoctorKindDefinition;
  /** Slugs of OTHER kinds that embed this one via `kind_edge`, sorted. */
  parentKinds: string[];
  /** `kind_component` rows on this kind, ANY platform (not just web). */
  componentCount: number;
  /** `kind_surface` rows on this kind. */
  surfaceCount: number;
  /** Compiled/legacy render paths (system-kinds bridge, artifact registry). */
  codeRenderPathCount: number;
}

/**
 * THE PREDICATE. Returns the exemption class for a kind, or null if every cell
 * is genuinely applicable (so every gap stays loud).
 *
 *   data_only         ⇔ metadata.family === 'workflow_io'
 *
 *   nested_only_child ⇔ !is_active                       (R6: active ⇒ standalone render-trust)
 *                     ∧ ∃ kind_edge(parent ≠ self, child = this)
 *                     ∧ componentCount === 0             (no standalone renderer)
 *                     ∧ surfaceCount === 0               (never arrives standalone)
 *                     ∧ codeRenderPathCount === 0        (no compiled/legacy path)
 */
export function classifyExemption(evidence: ExemptionEvidence): KindExemption | null {
  const { kind, parentKinds, componentCount, surfaceCount, codeRenderPathCount } = evidence;

  const family = kindFamily(kind.metadata);
  if (family !== null && GENERATED_CONTRACT_FAMILIES.has(family)) {
    return {
      class: "data_only",
      subject: `generated ${family} contract (metadata.family=${family})`,
      parents: [],
    };
  }

  if (
    !kind.isActive &&
    parentKinds.length > 0 &&
    componentCount === 0 &&
    surfaceCount === 0 &&
    codeRenderPathCount === 0
  ) {
    return {
      class: "nested_only_child",
      subject: `nested-only child of ${parentKinds.join(", ")}`,
      parents: parentKinds,
    };
  }

  return null;
}

/** Why THIS cell is inapplicable — the `n/a` detail string. */
const EXEMPT_CELL_REASON: Record<ExemptionClass, Record<string, string>> = {
  data_only: {
    component: "framed contract data, never rendered",
    loading: "never rendered, so it never streams into a loading state",
    surface: "never arrives on a content surface",
    skill: "agents never emit it as content",
    content_block: "never delivered as content",
  },
  nested_only_child: {
    component: "renders inside its parent, never standalone",
    loading: "its parent's loading state covers it",
    surface: "arrives inside its parent's payload, never at its own detector",
    skill: "taught by its parent's skill",
    content_block: "delivered by its parent's content block",
  },
};

function naCell(exemption: KindExemption, column: AssetColumn): AssetCell {
  return {
    status: "n/a",
    detail: `${exemption.subject} — ${EXEMPT_CELL_REASON[exemption.class][column]}`,
  };
}

// ─── Schema-side `__kind` strip ─────────────────────────────────────────────

const KIND_KEY = "__kind";

/**
 * Deep-remove the `__kind` identity key from a JSON Schema — every
 * `properties.__kind` member and every `"__kind"` entry in a `required` array,
 * at any depth ($defs, items, nested objects).
 *
 * Why: `validateStructuralLeg` deep-strips `__kind` from the SAMPLE (schemas
 * historically describe source data; `__kind` is injected at emit time). The
 * generated agent_io contracts flipped that — their provider response_format
 * schemas REQUIRE `__kind` so the model emits it — which made every such kind
 * fail the recomputed gate on the identity key alone. Stripping the key from
 * BOTH sides keeps the gate checking the substance of the contract while
 * staying indifferent to where the identity key travels.
 *
 * (A field literally named "properties"/"required" nested inside another
 * `properties` map could theoretically be over-stripped; generated Pydantic
 * schemas never produce that shape.)
 */
export function stripKindFromJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(stripKindFromJsonSchema);
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
      if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
        const props: Record<string, unknown> = {};
        for (const [prop, propSchema] of Object.entries(value as Record<string, unknown>)) {
          if (prop === KIND_KEY) continue;
          props[prop] = stripKindFromJsonSchema(propSchema);
        }
        out[key] = props;
        continue;
      }
      if (key === "required" && Array.isArray(value)) {
        out[key] = value.filter((entry) => entry !== KIND_KEY);
        continue;
      }
      out[key] = stripKindFromJsonSchema(value);
    }
    return out;
  }
  return schema;
}

// ─── Internals ──────────────────────────────────────────────────────────────

/** Grace window for the stale-example comparison — same-wave writes (kind +
 * example authored minutes apart in one migration) are not drift. */
const STALE_EXAMPLE_GRACE_MS = 5 * 60 * 1000;

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function byKindThenMessage(a: ShapeFinding, b: ShapeFinding): number {
  return (
    a.code.localeCompare(b.code) ||
    (a.kind ?? "").localeCompare(b.kind ?? "") ||
    a.message.localeCompare(b.message)
  );
}

// ─── The doctor ─────────────────────────────────────────────────────────────

export function runShapeDoctor(input: ShapeDoctorInput): ShapeDoctorReport {
  const kinds = [...input.kinds].sort((a, b) => a.kind.localeCompare(b.kind));
  const knownKinds = new Set(kinds.map((k) => k.kind));

  const examplesByKindId = new Map<string, DoctorKindExample[]>();
  for (const ex of input.examples) {
    const list = examplesByKindId.get(ex.kindDefinitionId) ?? [];
    list.push(ex);
    examplesByKindId.set(ex.kindDefinitionId, list);
  }
  const componentsByKindId = new Map<string, DoctorKindComponent[]>();
  for (const c of input.components) {
    const list = componentsByKindId.get(c.kindDefinitionId) ?? [];
    list.push(c);
    componentsByKindId.set(c.kindDefinitionId, list);
  }
  const surfacesByKindId = new Map<string, DoctorKindSurface[]>();
  for (const s of input.surfaces) {
    const list = surfacesByKindId.get(s.kindDefinitionId) ?? [];
    list.push(s);
    surfacesByKindId.set(s.kindDefinitionId, list);
  }

  const teachings = attributeSkillsToKinds(input.renderBlockSkills, knownKinds);
  const teachingsByKind = new Map<string, SkillTeaching[]>();
  for (const t of teachings) {
    const list = teachingsByKind.get(t.kind) ?? [];
    list.push(t);
    teachingsByKind.set(t.kind, list);
  }

  const compiledKinds = new Set(input.codeRenderPaths.compiledKinds);
  const artifactKinds = new Set(input.codeRenderPaths.artifactKinds);
  // null = the caller could not read the dispatch table; the check is skipped
  // (and the caller owes its own loud degrade), never quietly passed.
  const dispatchKeys = input.codeRenderPaths.dispatchKeys
    ? new Set(input.codeRenderPaths.dispatchKeys)
    : null;
  const surfaceTokens = new Set(input.surfaces.map((s) => s.token));

  // Nesting graph: child kind id → slugs of the OTHER kinds that embed it.
  // Self-edges (`decision_node.yes → decision_node`, `task_item.children →
  // task_item`) are recursion, NOT evidence that the kind only renders nested.
  const kindSlugById = new Map(kinds.map((k) => [k.id, k.kind]));
  const parentKindsByChildId = new Map<string, string[]>();
  for (const edge of input.edges) {
    if (edge.parentDefinitionId === edge.childDefinitionId) continue;
    const parentSlug = kindSlugById.get(edge.parentDefinitionId);
    if (parentSlug === undefined) continue;
    const list = parentKindsByChildId.get(edge.childDefinitionId) ?? [];
    if (!list.includes(parentSlug)) list.push(parentSlug);
    parentKindsByChildId.set(edge.childDefinitionId, list);
  }
  for (const list of parentKindsByChildId.values()) list.sort();

  const reds: ShapeFinding[] = [];
  const yellows: ShapeFinding[] = [];
  const rows: ShapeKindRow[] = [];

  for (const kind of kinds) {
    const examples = (examplesByKindId.get(kind.id) ?? []).sort(
      (a, b) => parseTime(b.updatedAt) - parseTime(a.updatedAt),
    );
    const canonical = examples.find((e) => e.isCanonical) ?? null;
    const hasSchema =
      kind.emittedJsonSchema !== null && kind.emittedJsonSchema !== undefined;

    // Render-capability evidence, hoisted: the exemption class depends on it.
    const componentRows = componentsByKindId.get(kind.id) ?? [];
    const kindSurfaces = surfacesByKindId.get(kind.id) ?? [];
    const codePaths: string[] = [];
    if (compiledKinds.has(kind.kind)) codePaths.push("system-kinds bridge");
    if (artifactKinds.has(kind.kind)) codePaths.push("artifact-type-registry");

    const exemption = classifyExemption({
      kind,
      parentKinds: parentKindsByChildId.get(kind.id) ?? [],
      componentCount: componentRows.length,
      surfaceCount: kindSurfaces.length,
      codeRenderPathCount: codePaths.length,
    });

    // definition — row exists (given), has emitted_json_schema.
    const definition: AssetCell = hasSchema
      ? { status: "ok" }
      : { status: "missing", detail: "no emitted_json_schema" };

    // example — canonical kind_example row is the target state.
    let example: AssetCell;
    if (canonical) {
      example = { status: "ok", detail: `${examples.length} example(s), canonical present` };
    } else if (examples.length > 0) {
      example = {
        status: "warn",
        detail: `no canonical example (${examples.length} non-canonical)`,
      };
      yellows.push({
        severity: "yellow",
        code: "no-canonical-example",
        kind: kind.kind,
        message: `kind "${kind.kind}" has ${examples.length} example(s) but none is canonical — promote one (ratified 2026-07-15: every kind carries a canonical example)`,
      });
    } else if (kind.sampleData !== null && kind.sampleData !== undefined) {
      example = { status: "warn", detail: "interim sample_data only" };
      yellows.push({
        severity: "yellow",
        code: "no-canonical-example",
        kind: kind.kind,
        message: `kind "${kind.kind}" has only interim sample_data — author a canonical kind_example (ratified 2026-07-15: every kind carries a canonical example)`,
      });
    } else {
      example = { status: "missing", detail: "no example and no sample_data" };
      yellows.push({
        severity: "yellow",
        code: "no-example",
        kind: kind.kind,
        message: `kind "${kind.kind}" has no example (no kind_example row, no interim sample_data)`,
      });
    }

    const newestExample = canonical ?? examples[0] ?? null;

    // gate_structural — RECOMPUTED, never read from validation_status/is_active.
    let gate: AssetCell;
    const gateSample = canonical
      ? { data: canonical.data, source: "canonical example" }
      : examples[0]
        ? { data: examples[0].data, source: "non-canonical example" }
        : kind.sampleData !== null && kind.sampleData !== undefined
          ? { data: kind.sampleData, source: "interim sample_data" }
          : null;
    if (!hasSchema) {
      gate = { status: "missing", detail: "no emitted_json_schema to validate against" };
    } else if (!gateSample) {
      gate = { status: "missing", detail: "nothing to validate (no example or sample_data)" };
    } else {
      const leg = validateStructuralLeg(
        gateSample.data,
        stripKindFromJsonSchema(kind.emittedJsonSchema),
      );
      if (leg.ok) {
        gate = {
          status: "ok",
          detail:
            gateSample.source === "canonical example"
              ? undefined
              : `validated against ${gateSample.source}`,
        };
      } else {
        gate = {
          status: "warn",
          detail: `recomputed gate FAILED (${gateSample.source}): ${leg.detail ?? "invalid"}`,
        };
        if (kind.isActive) {
          reds.push({
            severity: "red",
            code: "active-gate-fail",
            kind: kind.kind,
            message: `ACTIVE kind "${kind.kind}" fails its recomputed structural gate (schema drifted under the ${gateSample.source}): ${leg.detail ?? "invalid"}`,
          });
        }
      }
    }

    // stale example — the example predates the kind definition's last change,
    // so the SCHEMA MAY HAVE MOVED UNDER IT. Grace window absorbs same-wave
    // writes (kind + example authored minutes apart in one migration).
    //
    // 🚨 The timestamp is a PROXY for "the schema moved", and it is a leaky
    // one: `kind_definition.updated_at` is bumped by ANY write to the row,
    // including ones that cannot touch the schema at all — most commonly
    // `content_ir.set_kind_activation`, which flips `is_active` and stamps
    // `metadata.activation_note`. Activating a wave of kinds therefore used to
    // mint one false `stale-example` per kind (121 of them on 2026-08-21, when
    // the 156 workflow node output contracts were activated), and a board full
    // of findings nobody can close is how a board stops being read.
    //
    // So the proxy now defers to the direct evidence the doctor already
    // computes one block up: the structural gate is RECOMPUTED against the
    // kind's LIVE schema. A passing gate means the example still validates
    // against the schema as it stands today — whatever the timestamps say, it
    // is not stale in the only sense this rule cares about. The hard case is
    // not lost: an example that genuinely stopped validating under an ACTIVE
    // kind is already a RED (`active-gate-fail`), independent of any mtime.
    if (
      newestExample &&
      gate.status !== "ok" &&
      parseTime(newestExample.updatedAt) + STALE_EXAMPLE_GRACE_MS <
        parseTime(kind.updatedAt)
    ) {
      yellows.push({
        severity: "yellow",
        code: "stale-example",
        kind: kind.kind,
        message: `kind "${kind.kind}" example is older than the kind definition (example ${newestExample.updatedAt} < kind ${kind.updatedAt}) and does not pass the recomputed gate — revalidate/recapture`,
      });
    }

    // red: an ACTIVE bundled web/output row naming a component the host's
    // dispatch table does not have. NOTHING catches this at runtime — a kind
    // carrying a `legacyBlockType` facet routes through the compiled bridge
    // ALWAYS, so the block renders and the registry keeps claiming a component
    // that does not exist (proven 2026-08-23 by sabotaging `rating`'s row).
    // `source='db'` rows are exempt: those re-type to `db_kind_component` and
    // compile their own `component_source` in-page, so the key is a LABEL, not
    // a dispatch entry. `generic_structured` is the sanctioned R6 fallback.
    const danglingComponents =
      dispatchKeys === null
        ? []
        : componentRows.filter(
            (c) =>
              c.isActive &&
              c.source === "bundled" &&
              c.platform === "web" &&
              c.role === "output" &&
              c.componentKey !== GENERIC_STRUCTURED_KEY &&
              !dispatchKeys.has(c.componentKey),
          );
    for (const row of danglingComponents) {
      reds.push({
        severity: "red",
        code: "dangling-component-key",
        kind: kind.kind,
        message: `ACTIVE bundled kind_component for "${kind.kind}" names component_key "${row.componentKey}", which resolveBlockDispatch (block-dispatch.tsx) does not know — the registry advertises a renderer that does not exist; register the key or repair the row`,
      });
    }

    // component — kind_component (platform web) or a compiled/legacy render path.
    // `n/a` only ever replaces the missing/warn branch — never a positive.
    // A dangling row is NOT evidence of a component, so it cannot make the cell
    // green (that is exactly the lie the red above names).
    // ROLE MATTERS. This column asks "can this kind RENDER?", which only an
    // `output` row answers. Counting every web row made a kind green on the
    // strength of an `input` row — or, since the role CHECK was widened on
    // 2026-08-25, a `loading` row: the board would report a renderer for a
    // kind that owns nothing but a skeleton. The dangling-key red above
    // already filters `role === "output"`; this cell now agrees with it.
    const danglingIds = new Set(danglingComponents.map((c) => c.id));
    const webComponents = componentRows.filter(
      (c) => c.platform === "web" && c.role === "output" && !danglingIds.has(c.id),
    );
    let component: AssetCell;
    if (webComponents.length > 0) {
      component = {
        status: "ok",
        detail: webComponents.map((c) => `${c.componentKey} (${c.role})`).join(", "),
      };
    } else if (codePaths.length > 0) {
      component = {
        status: "warn",
        detail: `compiled/legacy render path only (${codePaths.join(" + ")}) — no kind_component row`,
      };
    } else if (exemption) {
      component = naCell(exemption, "component");
    } else {
      component = { status: "missing", detail: "no web component and no compiled render path" };
    }
    // red (c): component rows on a schemaless kind (FK guards the id itself).
    if (componentRows.length > 0 && !hasSchema) {
      reds.push({
        severity: "red",
        code: "component-without-schema",
        kind: kind.kind,
        message: `kind_component row(s) [${componentRows.map((c) => c.componentKey).join(", ")}] point at kind "${kind.kind}" which has no emitted_json_schema`,
      });
    }

    // loading — the declared loading component (kind_definition.metadata
    // .loading_component, or a compiled definition's `loadingComponent`).
    // The loading state is a SEPARATE component, selected by slug from the
    // hardcoded loading library (react/loading/kind-loading-slugs.ts): while
    // a kind's region streams, the pending/announced stages render that
    // loader. An UNKNOWN slug is a RED — the registry advertises a loader that
    // does not exist and nothing at runtime ever says so.
    //
    // NO declaration is no longer automatically a gap: the runtime DERIVES a
    // slug from the kind's own schema before it gives up (precedence
    // declaration → derivation → `generic`), and the caller hands that
    // derivation in as `inferredLoadingSlugs`. See that field's doc.
    const declaredLoadingDb = kindLoadingComponent(kind.metadata);
    const declaredLoadingCompiled = input.compiledLoadingSlugs?.get(kind.kind) ?? null;
    const declaredLoading = declaredLoadingDb ?? declaredLoadingCompiled;
    const loadingSource = declaredLoadingDb !== null ? "db metadata" : "compiled definition";
    let loading: AssetCell;
    if (declaredLoading !== null) {
      if (input.loadingLibrarySlugs === undefined) {
        loading = {
          status: "ok",
          detail: `${declaredLoading} (${loadingSource}; library slugs unavailable — not checked)`,
        };
      } else if (input.loadingLibrarySlugs.has(declaredLoading)) {
        loading = { status: "ok", detail: `${declaredLoading} (${loadingSource})` };
      } else {
        loading = {
          status: "warn",
          detail: `UNKNOWN slug "${declaredLoading}" (${loadingSource}) — not in the loading library; ignored at runtime in favour of the derived silhouette`,
        };
        reds.push({
          severity: "red",
          code: "unknown-loading-component",
          kind: kind.kind,
          message: `kind "${kind.kind}" declares loading_component "${declaredLoading}" (${loadingSource}), which is not in the loading library (kind-loading-slugs.ts) — the runtime ignores it and derives a silhouette instead, so the declaration does nothing; pick a real slug or add the loader to the library`,
        });
      }
    } else if (exemption) {
      loading = naCell(exemption, "loading");
    } else if (webComponents.length > 0 || codePaths.length > 0) {
      // Undeclared. The runtime does NOT drop straight to the generic
      // skeleton any more — it DERIVES a slug from the kind's own schema
      // (react/loading/infer-loading-slug.ts). A derived loader is a real,
      // shape-appropriate loader, so it is `ok` with nothing to report; the
      // yellow is reserved for the kinds whose shape derives nothing and
      // therefore really do stream behind the shapeless skeleton.
      const inferredLoading = input.inferredLoadingSlugs?.get(kind.kind) ?? null;
      if (inferredLoading !== null) {
        loading = { status: "ok", detail: `derived: ${inferredLoading} (no declaration)` };
      } else {
        // A caller that supplied no map could not run the inference — say the
        // pre-inference thing rather than assert a derivation nobody attempted.
        const derivationRan = input.inferredLoadingSlugs !== undefined;
        loading = {
          status: "missing",
          detail: derivationRan
            ? "no loading_component, and its shape derives none — streams behind the generic skeleton"
            : "no loading_component declared — streams behind the generic skeleton",
        };
        yellows.push({
          severity: "yellow",
          code: "no-loading-component",
          kind: kind.kind,
          message: derivationRan
            ? `kind "${kind.kind}" renders but declares no loading_component, and its schema is not distinctive enough to derive one — while it streams the user really does see the shapeless generic skeleton; set metadata.loading_component to a loading-library slug`
            : `kind "${kind.kind}" renders but declares no loading_component — while it streams the user sees the generic skeleton; set metadata.loading_component to a loading-library slug`,
        });
      }
    } else {
      // No renderer at all — the component cell already screams; a second
      // finding here would be noise, but the gap stays visible in the cell.
      loading = {
        status: "missing",
        detail: "no loading_component (no renderer yet either)",
      };
    }

    // skill — render_block skill(s) teaching this kind.
    const kindTeachings = teachingsByKind.get(kind.kind) ?? [];
    let skill: AssetCell;
    if (kindTeachings.length === 0 && exemption) {
      // Structurally cannot own a standalone skill — no gap, no finding.
      skill = naCell(exemption, "skill");
    } else if (kindTeachings.length === 0) {
      skill = { status: "missing", detail: "no render_block skill teaches this kind" };
      yellows.push({
        severity: "yellow",
        code: "no-skill",
        kind: kind.kind,
        message: `kind "${kind.kind}" has no render_block skill teaching it`,
      });
    } else {
      const bySyntax = new Map<string, SkillTeaching[]>();
      for (const t of kindTeachings) {
        const list = bySyntax.get(t.syntax) ?? [];
        list.push(t);
        bySyntax.set(t.syntax, list);
      }
      // A syntax with >1 teacher is a candidate violation. It is only a RED
      // when the kind has NOT declared which skill owns it (kindSkillOwner,
      // above) — an admin's resolution is a declaration, not a deletion.
      const contested = [...bySyntax.entries()].filter(([, list]) => list.length > 1);
      const unresolved: Array<[string, SkillTeaching[]]> = [];
      const resolved: Array<[string, string]> = [];
      for (const [syntax, list] of contested) {
        const declared = kindSkillOwner(
          kind.metadata,
          syntax === "xml" ? "xml" : "json",
        );
        // A declaration naming a skill that no longer teaches this kind is
        // STALE — it silences nothing and says exactly why.
        if (declared !== null && list.some((t) => t.skillId === declared)) {
          resolved.push([syntax, declared]);
        } else {
          unresolved.push([syntax, list]);
          if (declared !== null) {
            reds.push({
              severity: "red",
              code: "duplicate-skill",
              kind: kind.kind,
              message: `kind "${kind.kind}" declares skill owner "${declared}" for ${syntax} syntax, but that skill no longer teaches it — the declaration is STALE; re-decide among ${list.map((t) => t.skillId).join(", ")}`,
            });
            continue;
          }
          reds.push({
            severity: "red",
            code: "duplicate-skill",
            kind: kind.kind,
            message: `${list.length} render_block skills teach kind "${kind.kind}" (${syntax} syntax): ${list.map((t) => t.skillId).join(", ")} — R9 law is ONE per kind per syntax`,
          });
        }
      }
      if (unresolved.length > 0) {
        skill = {
          status: "warn",
          detail: `DUPLICATE skills per syntax: ${unresolved
            .map(([syntax, list]) => `${syntax}: ${list.map((t) => t.skillId).join(" + ")}`)
            .join("; ")}`,
        };
      } else if (resolved.length > 0) {
        skill = {
          status: "ok",
          detail: `owner declared — ${resolved
            .map(([syntax, skillId]) => `${syntax}: ${skillId}`)
            .join("; ")} (other skills embed this kind, they do not teach it)`,
        };
      } else {
        skill = {
          status: "ok",
          detail: kindTeachings.map((t) => `${t.skillId} (${t.syntax})`).join(", "),
        };
      }
    }

    // content_block — any template referencing the canonical `__kind` slug.
    const blockPattern = new RegExp(`"__kind"\\s*:\\s*"${escapeRegExp(kind.kind)}"`);
    const blockCount = input.contentBlocks.filter((b) => blockPattern.test(b.template)).length;
    let contentBlock: AssetCell;
    if (blockCount > 0) {
      contentBlock = { status: "ok", detail: `${blockCount} content block(s)` };
    } else if (exemption) {
      contentBlock = naCell(exemption, "content_block");
    } else {
      contentBlock = { status: "missing", detail: "no content block references this kind" };
      yellows.push({
        severity: "yellow",
        code: "no-content-block",
        kind: kind.kind,
        message: `kind "${kind.kind}" has no content block referencing "__kind": "${kind.kind}"`,
      });
    }

    // surface — most kinds legitimately have none yet (Stage 5); the exempted
    // classes will never have one at all.
    let surface: AssetCell;
    if (kindSurfaces.length > 0) {
      surface = {
        status: "ok",
        detail: kindSurfaces.map((s) => `${s.surfaceType}:${s.token}`).join(", "),
      };
    } else if (exemption) {
      surface = naCell(exemption, "surface");
    } else {
      surface = { status: "warn", detail: "no surface registered (legitimate until Stage 5)" };
    }

    rows.push({
      kind: kind.kind,
      label: kind.label,
      isActive: kind.isActive,
      family: kindFamily(kind.metadata),
      exemption,
      assets: {
        definition,
        example,
        gate_structural: gate,
        component,
        loading,
        skill,
        content_block: contentBlock,
        surface,
      },
    });
  }

  // Detector census — frozen-literal tokens with no kind_surface registration.
  // EXPECTED until Stage 5 (generated bootstraps swap in) — yellow, never red.
  const seenTokens = new Map<string, DoctorDetectorToken & { sources: string[] }>();
  for (const t of input.detectorTokens) {
    if (CONTROL_TAGS.has(t.token)) continue;
    const existing = seenTokens.get(t.token);
    if (existing) {
      if (!existing.sources.includes(t.source)) existing.sources.push(t.source);
    } else {
      seenTokens.set(t.token, { ...t, sources: [t.source] });
    }
  }
  for (const t of [...seenTokens.values()].sort((a, b) => a.token.localeCompare(b.token))) {
    if (surfaceTokens.has(t.token)) continue;
    yellows.push({
      severity: "yellow",
      code: "detector-token-unregistered",
      message: `detector token "${t.token}" (${t.surfaceType}; ${t.sources.join(", ")}) has no kind_surface row — expected until Stage 5`,
    });
  }

  // Registry↔host reconciliation (Wave 1 C2) — every ACTIVE kind_surface row
  // must be fireable by a host literal. The generated bootstrap is derived
  // straight from kind_surface, so this equivalently proves no bootstrap entry
  // diverges from the hand-coded literals (which stay until the Wave-2
  // enforcement ratchet).
  if (input.hostSurfaceTokens) {
    const host = input.hostSurfaceTokens;
    const hostCovered = ["xml_tag", "fence_lang", "json_root_key"] as const;
    for (const s of [...input.surfaces].sort((a, b) => a.token.localeCompare(b.token))) {
      if (!s.isActive) continue;
      const surfaceType = hostCovered.find((t) => t === s.surfaceType);
      if (!surfaceType) continue; // tool_name etc. — no markdown host to fire it
      if (host[surfaceType].has(s.token.toLowerCase())) continue;
      reds.push({
        severity: "red",
        code: "surface-token-undetectable",
        message: `ACTIVE kind_surface (${s.surfaceType}, "${s.token}") has NO host detector literal — the registry advertises a surface no host can fire; add the host token or deactivate the row, then pnpm check:shapes:surfaces:refresh`,
      });
    }
  }

  // Crosswalk coverage — with the generated crosswalk supplied, EVERY name the
  // doctor observes (kind slug, non-control detector token, surface token) must
  // be classified. A miss is RED: the vocabulary grew without classification.
  if (input.crosswalkNames) {
    const names = input.crosswalkNames;
    const missing = new Map<string, string>();
    for (const kind of kinds) {
      if (!names.has(kind.kind)) missing.set(kind.kind, "kind_definition slug");
    }
    for (const t of input.detectorTokens) {
      if (CONTROL_TAGS.has(t.token)) continue;
      if (!names.has(t.token)) missing.set(t.token, `detector token (${t.source})`);
    }
    for (const s of input.surfaces) {
      if (!names.has(s.token)) missing.set(s.token, `kind_surface token (${s.surfaceType})`);
    }
    for (const [name, what] of [...missing.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      reds.push({
        severity: "red",
        code: "vocab-unclassified",
        message: `${what} "${name}" is not classified in the content-vocab crosswalk — run pnpm check:shapes:crosswalk:refresh (and add a rule if it fails)`,
      });
    }
  }

  // Contract re-drift detector — the ONE thing left of the old `contract-gap`
  // rule after the 2026-08-20 eviction (KINDS_EVERYWHERE_PLAN.md §10b item 5).
  //
  // It used to check the aidream contract MANIFEST against this registry both
  // ways. That is gone: machine-minted I/O contracts live in
  // `content_ir.io_contract` now, so a manifest contract having no registry row
  // is the CORRECT state, and asserting otherwise fired ~975 false reds. The
  // authoritative parity check is aidream's
  // `scripts/sync_content_ir_contracts.py --check`, which derives the inventory
  // live instead of reading a snapshot; a second implementation here could only
  // disagree with it.
  //
  // What remains is the regression the eviction has to be able to see: a
  // machine-minted contract getting back into the Shape registry.
  //
  // 🚨 MATCH ON THE SLUG, NEVER ON `metadata.family`. The first version of this
  // rule keyed on the generated families and reded 48 REAL curated shapes —
  // `agent_result`, `boolean`, `branch_result`, `json`, `text` and the rest of
  // the hand-authored workflow-I/O set all legitimately carry
  // `family: "workflow_io"`, and agent-authored kinds carry `agent_io`. That
  // family-based heuristic had already been removed once as a bug (see
  // `studio-catalog.ts`: "the old family-based heuristic wrongly hid them and is
  // gone") and must not come back. What actually identifies a machine-minted
  // contract is its FINGERPRINT NAME — `<family>_<source>_<sha8>_<direction>`
  // (audit break #3: "the generated name is a fingerprint") — which no curated
  // shape can collide with, because the naming rules forbid family prefixes and
  // hashes outright (NOMENCLATURE.md).
  for (const kind of kinds) {
    if (!kind.isActive || !CONTRACT_SLUG_RE.test(kind.kind)) continue;
    reds.push({
      severity: "red",
      code: "contract-gap",
      kind: kind.kind,
      message: `ACTIVE machine-minted contract slug "${kind.kind}" is in content_ir.kind_definition — I/O contracts were EVICTED to content_ir.io_contract and nothing may mint one back into the Shape registry`,
    });
  }

  reds.sort(byKindThenMessage);
  yellows.sort(byKindThenMessage);
  const findings = [...reds, ...yellows];

  const cells: Record<AssetStatus, number> = { ok: 0, warn: 0, missing: 0, "n/a": 0 };
  for (const row of rows) {
    for (const col of ASSET_COLUMNS) cells[row.assets[col].status] += 1;
  }

  return {
    rows,
    findings,
    totals: { kinds: rows.length, red: reds.length, yellow: yellows.length, cells },
  };
}
