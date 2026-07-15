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
 *       one the schema is unproven. R4 explicitly allows examples per kind, and
 *       5 child kinds already carry one (`recipe_ingredient`, `recipe_step`,
 *       `resource_item`, `resource_category`, `task_item`) — proof that
 *       `no-example` on a child is an achievable, REAL gap, not an impossibility.
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

import { validateStructuralLeg } from "./kind-dual-gate";

// ─── Asset columns (v1) ─────────────────────────────────────────────────────

export const ASSET_COLUMNS = [
  "definition",
  "example",
  "gate_structural",
  "component",
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
}

export interface DoctorKindSurface {
  id: string;
  kindDefinitionId: string;
  surfaceType: string;
  token: string;
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

export interface DoctorCodeRenderPaths {
  /** Kinds with a compiled bridge/component facet (system-kinds.ts). */
  compiledKinds: string[];
  /** Kinds referenced by artifact-type-registry `kinds:` facades. */
  artifactKinds: string[];
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
   * The aidream generated-contract inventory snapshot
   * (scripts/shape/content-ir-contract-manifest.json). When provided, the
   * doctor cross-checks it against the live catalog: a manifest contract with
   * no ACTIVE live kind row, or an ACTIVE live generated-family kind absent
   * from the manifest, is a RED `contract-gap` finding.
   */
  contractManifest?: DoctorContractManifestEntry[];
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
  | "detector-extract-failed" // emitted by the CLI when a frozen literal vanished
  | "snapshot-drift" // emitted by the CLI on committed-vs-live drift
  | "vocab-unclassified" // a kind/detector/surface name missing from the crosswalk
  | "contract-gap" // manifest ↔ live catalog mismatch for a generated contract family
  | "coverage-input-missing" // emitted by the CLI when crosswalk/manifest snapshot is unreadable
  // yellow
  | "no-example"
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
    surface: "never arrives on a content surface",
    skill: "agents never emit it as content",
    content_block: "never delivered as content",
  },
  nested_only_child: {
    component: "renders inside its parent, never standalone",
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
    } else if (kind.sampleData !== null && kind.sampleData !== undefined) {
      example = { status: "warn", detail: "interim sample_data only" };
    } else {
      example = { status: "missing", detail: "no example and no sample_data" };
      yellows.push({
        severity: "yellow",
        code: "no-example",
        kind: kind.kind,
        message: `kind "${kind.kind}" has no example (no kind_example row, no interim sample_data)`,
      });
    }

    // stale example — the example predates the kind definition's last change
    // (schema may have moved under it). Grace window absorbs same-wave writes.
    const newestExample = canonical ?? examples[0] ?? null;
    if (
      newestExample &&
      parseTime(newestExample.updatedAt) + STALE_EXAMPLE_GRACE_MS <
        parseTime(kind.updatedAt)
    ) {
      yellows.push({
        severity: "yellow",
        code: "stale-example",
        kind: kind.kind,
        message: `kind "${kind.kind}" example is older than the kind definition (example ${newestExample.updatedAt} < kind ${kind.updatedAt}) — revalidate/recapture`,
      });
    }

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

    // component — kind_component (platform web) or a compiled/legacy render path.
    // `n/a` only ever replaces the missing/warn branch — never a positive.
    const webComponents = componentRows.filter((c) => c.platform === "web");
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
      const duplicates = [...bySyntax.entries()].filter(([, list]) => list.length > 1);
      if (duplicates.length > 0) {
        skill = {
          status: "warn",
          detail: `DUPLICATE skills per syntax: ${duplicates
            .map(([syntax, list]) => `${syntax}: ${list.map((t) => t.skillId).join(" + ")}`)
            .join("; ")}`,
        };
        for (const [syntax, list] of duplicates) {
          reds.push({
            severity: "red",
            code: "duplicate-skill",
            kind: kind.kind,
            message: `${list.length} render_block skills teach kind "${kind.kind}" (${syntax} syntax): ${list.map((t) => t.skillId).join(", ")} — R9 law is ONE per kind per syntax`,
          });
        }
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

  // Contract-family gap — the aidream manifest is the runtime inventory; the
  // live catalog must carry exactly its ACTIVE generated rows, both directions.
  if (input.contractManifest) {
    const liveActiveBySlug = new Map(
      kinds.filter((k) => k.isActive).map((k) => [k.kind, k]),
    );
    for (const c of [...input.contractManifest].sort((a, b) => a.kind.localeCompare(b.kind))) {
      if (!liveActiveBySlug.has(c.kind)) {
        reds.push({
          severity: "red",
          code: "contract-gap",
          message: `manifest contract "${c.kind}" (${c.family}) has no ACTIVE live kind_definition row — publisher and catalog have diverged`,
        });
      }
    }
    const manifestSlugs = new Set(input.contractManifest.map((c) => c.kind));
    for (const kind of kinds) {
      const family = kindFamily(kind.metadata);
      if (!kind.isActive || family === null || !GENERATED_CONTRACT_FAMILIES.has(family)) continue;
      if (!manifestSlugs.has(kind.kind)) {
        reds.push({
          severity: "red",
          code: "contract-gap",
          kind: kind.kind,
          message: `ACTIVE generated kind "${kind.kind}" (${family}) is not in the contract manifest — stale catalog row or stale snapshot (pnpm check:shapes:manifest:refresh)`,
        });
      }
    }
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
