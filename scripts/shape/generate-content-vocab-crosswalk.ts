#!/usr/bin/env tsx
/**
 * generate-content-vocab-crosswalk — the canonical content-vocabulary taxonomy
 * crosswalk (Content IR Wave 1, project A1 / P7).
 *
 * Enumerates EVERY named content vocabulary item across the platform —
 *   · aidream BlockType enum (matrx_ai processing blocks)
 *   · generated TypedRenderBlock union (types/python-generated/stream-events.ts)
 *   · ClientOnly / ServerOnly render blocks (types/python-generated/missing-types.ts)
 *   · artifact type registry (canvasTypes + aliases + kind facades)
 *   · frozen detector literals (stream-block-accumulator, content-prefilter,
 *     content-splitter-v2 — via the shared shape-doctor extraction)
 *   · live content_ir.kind_definition slugs + kind_surface tokens (read-only)
 *   · the aidream generated-contract manifest snapshot (all four families)
 * — and classifies each as exactly ONE of:
 *
 *   shape               — a registered kind, or a structured contract that
 *                         should be one (kind = mapped slug; null = candidate)
 *   protocol            — control/event/envelope plumbing; never a Shape
 *   scalar_generic      — generic scalar / markup / media primitive
 *   intentionally_opaque — deliberately untyped catch-all
 *
 * The JSON artifact (scripts/shape/content-vocab-crosswalk.json) is
 * GENERATED-ONLY — humans and agents never hand-edit it. The classification
 * AUTHORITY is the rule tables in THIS file; regeneration is deterministic
 * given the same code + DB state. Any vocabulary item that no rule claims
 * FAILS the run loudly — zero unclassified items is the invariant.
 *
 *   pnpm check:shapes:crosswalk:refresh   # regenerate + write the JSON
 *   pnpm check:shapes:crosswalk           # regenerate in-memory, diff vs
 *                                         #   committed, exit 1 on drift /
 *                                         #   unclassified / contract gaps
 *
 * READ-ONLY against the DB — never writes to Supabase.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import {
  CONTROL_TAGS,
  GENERATED_CONTRACT_FAMILIES,
} from "../../features/content-ir/registry/shape-doctor";
import { extractDetectorTokensFromTexts } from "../../features/content-ir/registry/shape-doctor-extract";
import {
  parseContractManifestSnapshot,
  type ContractManifestSnapshot,
} from "./contract-manifest-format";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CROSSWALK_PATH = resolve(ROOT, "scripts/shape/content-vocab-crosswalk.json");
const MANIFEST_PATH = resolve(ROOT, "scripts/shape/content-ir-contract-manifest.json");
const AIDREAM_ROOT = process.env.AIDREAM_ROOT ?? resolve(ROOT, "..", "aidream");
const BLOCKTYPE_PY = resolve(
  AIDREAM_ROOT,
  "packages/matrx-ai/matrx_ai/processing/blocks/models/base.py",
);
const STREAM_EVENTS_PATH = resolve(ROOT, "types/python-generated/stream-events.ts");
const MISSING_TYPES_PATH = resolve(ROOT, "types/python-generated/missing-types.ts");
const ARTIFACT_REGISTRY_PATH = resolve(
  ROOT,
  "features/canvas/artifact-types/artifact-type-registry.ts",
);
const ACCUMULATOR_PATH = resolve(
  ROOT,
  "features/agents/redux/execution-system/utils/stream-block-accumulator.ts",
);
const PREFILTER_PATH = resolve(
  ROOT,
  "features/agents/redux/execution-system/utils/content-prefilter.ts",
);
const SPLITTER_PATH = resolve(
  ROOT,
  "components/mardown-display/markdown-classification/processors/utils/content-splitter-v2.ts",
);

// ─── Crosswalk row shape ────────────────────────────────────────────────────

export const CLASSIFICATIONS = [
  "shape",
  "protocol",
  "scalar_generic",
  "intentionally_opaque",
] as const;
export type VocabClassification = (typeof CLASSIFICATIONS)[number];

export interface CrosswalkRow {
  name: string;
  /** Sorted, deduped source ids (e.g. "aidream:block_type", "db:kind_definition"). */
  sources: string[];
  classification: VocabClassification;
  /** Mapped kind slug for `shape` rows; null = unregistered shape candidate. */
  kind: string | null;
  /** True when `kind` (or the name itself) exists live in content_ir.kind_definition. */
  registered: boolean;
  /** kind_definition.metadata.family for registered rows (null otherwise/none). */
  family: string | null;
  rationale: string;
}

export interface CrosswalkFile {
  _generated: string;
  generated_for: string;
  /** Per-input availability — degraded inputs are recorded LOUDLY, never hidden. */
  inputs: Record<string, string>;
  totals: Record<VocabClassification, number> & { items: number };
  rows: CrosswalkRow[];
}

// ─── Classification tables (the AUTHORITY — code-owned, reviewed in PRs) ────

/**
 * Protocol/control plumbing — never a Shape. Includes the ratified Wave 1
 * protocol set (artifact, decision, editor_error, editor_code_snippet,
 * audiocite, schema_proposal) plus the CONTROL_TAGS shared with the shape
 * doctor, plus stream lifecycle/ack/envelope event blocks.
 */
const PROTOCOL_ITEMS: ReadonlyMap<string, string> = new Map([
  ...[...CONTROL_TAGS].map(
    (tag): [string, string] => [
      tag,
      "control tag (SHAPE_SYSTEM.md R2) — stream control/reasoning plumbing, code-owned, never a Shape",
    ],
  ),
  ["consolidated_reasoning", "server-side reasoning consolidation block — reasoning plumbing, not content"],
  ["artifact", "artifact envelope framing (attr XML tag / BlockType) — carries content, is not itself a Shape"],
  ["decision", "decision control block — ratified Wave 1 protocol set"],
  ["editor_error", "editor pill round-trip plumbing (code-editor error chips) — ratified Wave 1 protocol set"],
  ["editor_code_snippet", "editor pill round-trip plumbing (selected-code chips) — ratified Wave 1 protocol set"],
  ["audiocite", "inline audio-citation reference to a scribe session moment — protocol reference, not content"],
  [
    "schema_proposal",
    "schema-proposal control flow (drives apply-to-agent output_schema write) — ratified Wave 1 protocol set; its inactive kind_definition row is a validation aid only",
  ],
  ["matrx", "MatrxEnvelope (Matrx Actions) protocol framing — off-limits protocol surface per SHAPE_SYSTEM.md"],
  ["matrxBroker", "broker value-delivery plumbing — sets broker values, never rendered as content"],
  ["matrx_file", "file-reference envelope resolved via the universal file handler — transport, not content"],
  ["function_result", "generic tool-result envelope — the payload's typing is owned by tool_io contracts"],
  ["workflow_step", "workflow progress event"],
  ["search_error", "search failure event"],
  ["structured_input_warning", "structured-input validation warning event"],
  ["value_store_stored", "value-store write acknowledgement event"],
  ["context_groomed", "context lifecycle event"],
  ["podcast_stage", "podcast pipeline lifecycle event"],
  ["podcast_complete", "podcast pipeline lifecycle event"],
  ["scrape_batch_complete", "scrape pipeline lifecycle event"],
  ["search_replace", "document search/replace edit-operation event"],
]);

/** Generic scalar / markup / media primitives — real content, but no domain contract worth a Shape. */
const SCALAR_GENERIC_ITEMS: ReadonlyMap<string, string> = new Map([
  ["text", "generic text primitive (also registered as the workflow_io `text` generic for I/O gating)"],
  ["code", "generic code primitive"],
  ["table", "generic markdown table primitive"],
  ["image", "generic media primitive"],
  ["video", "generic media primitive"],
  ["audio", "generic media primitive (markdown audio link block)"],
  ["json", "generic JSON value (registered as the workflow_io `json` generic for I/O gating)"],
  ["number", "generic scalar (registered workflow_io generic)"],
  ["boolean", "generic scalar (registered workflow_io generic)"],
  ["string_list", "generic collection (registered workflow_io generic)"],
  ["items", "generic collection (registered workflow_io generic)"],
  ["html", "generic renderable markup primitive"],
  ["react", "generic renderable component-source primitive"],
  ["jsx", "artifact alias of the generic react component-source primitive"],
  ["tsx", "artifact alias of the generic react component-source primitive"],
  ["iframe", "generic embed primitive"],
  ["svg", "generic vector-markup primitive"],
  ["tree", "generic directory/file-tree text primitive (box-drawing render)"],
  ["youtube", "media embed primitive (video reference)"],
  ["accent-divider", "visual divider primitive"],
  ["heavy-divider", "visual divider primitive"],
  ["audio_output", "generated-media delivery block — media primitive"],
  ["image_output", "generated-media delivery block — media primitive"],
  ["video_output", "generated-media delivery block — media primitive"],
]);

/** Deliberately untyped catch-alls. */
const OPAQUE_ITEMS: ReadonlyMap<string, string> = new Map([
  [
    "unknown_data_event",
    "deliberate catch-all for unrecognized server data events — intentionally untyped by design",
  ],
]);

/**
 * Structured contracts that SHOULD be kinds but are not registered yet —
 * `shape` with kind: null. Closing one of these means registering the kind
 * and replacing the entry here with nothing (the live-slug rule takes over).
 */
const SHAPE_CANDIDATES: ReadonlyMap<string, string> = new Map([
  ["chart", "structured chart spec (client block + artifact type) — unregistered shape candidate"],
  ["map", "structured map spec (client block + artifact type) — unregistered shape candidate"],
  ["stats", "structured stats spec (client block + artifact type) — unregistered shape candidate"],
  ["diff", "structured diff spec (client block + artifact type) — unregistered shape candidate"],
  ["search_results", "typed server search-result display — candidate for data-only kind binding via tool_io"],
  ["fetch_results", "typed server fetch-result display — candidate for data-only kind binding via tool_io"],
  [
    "categorization_result",
    "typed server categorization output display — candidate for data-only kind binding",
  ],
]);

/** Static alias → registered kind slug (detector tokens, artifact aliases, legacy names). */
const KIND_ALIASES: ReadonlyMap<string, string> = new Map([
  ["flashcards", "flashcard_set"],
  ["quiz", "quiz_set"],
  ["presentation", "presentation_deck"],
  ["progress", "progress_tracker"],
  ["comparison", "comparison_set"],
  ["comparison_table", "comparison_set"],
  ["diagram", "diagram_spec"],
  ["decision-tree", "decision_tree"],
  ["recipe", "cooking_recipe"],
  ["mermaid", "mermaid_diagram"],
  ["mmd", "mermaid_diagram"],
  ["resources", "resource_collection"],
  ["research", "research_report"],
  ["troubleshooting", "troubleshooting_guide"],
  ["tasks", "task_list"],
  ["task", "task_list"], // artifact-registry alias only; the XML <task> control tag wins protocol first
  ["display_questionnaire", "questionnaire"],
]);

// ─── Source collection ──────────────────────────────────────────────────────

interface VocabItem {
  name: string;
  source: string;
}

function fail(message: string): never {
  console.error(`\x1b[31m\x1b[1mCROSSWALK GENERATION FAILED:\x1b[0m ${message}`);
  process.exit(2);
}

/** aidream BlockType enum values, parsed from the Python source. */
function readPythonBlockTypes(): string[] | null {
  if (!existsSync(BLOCKTYPE_PY)) return null;
  const text = readFileSync(BLOCKTYPE_PY, "utf8");
  const classStart = text.indexOf("class BlockType(");
  if (classStart < 0) fail(`class BlockType not found in ${BLOCKTYPE_PY}`);
  const rest = text.slice(classStart);
  const classEnd = rest.search(/\nclass /);
  const body = classEnd > 0 ? rest.slice(0, classEnd) : rest;
  const values = [...body.matchAll(/^ {4}[A-Z_]+ = "([^"]+)"$/gm)].map((m) => m[1]);
  if (values.length === 0) fail(`no enum values extracted from BlockType in ${BLOCKTYPE_PY}`);
  return values;
}

/** TYPED_RENDER_BLOCK_TYPES set literal from the generated stream-events.ts. */
function readTypedRenderBlockTypes(): string[] {
  const text = readFileSync(STREAM_EVENTS_PATH, "utf8");
  const match = /const TYPED_RENDER_BLOCK_TYPES = new Set<string>\(\[([\s\S]*?)\]\)/.exec(text);
  if (!match) fail(`TYPED_RENDER_BLOCK_TYPES literal not found in ${STREAM_EVENTS_PATH}`);
  const values = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (values.length === 0) fail("TYPED_RENDER_BLOCK_TYPES extracted empty");
  return values;
}

/** ClientOnly / ServerOnly discriminator tokens from missing-types.ts, via the unions. */
function readMissingTypeTokens(): { client: string[]; server: string[] } {
  const text = readFileSync(MISSING_TYPES_PATH, "utf8");
  const tokenOf = (interfaceName: string): string => {
    const m = new RegExp(
      `interface ${interfaceName} \\{[\\s\\S]*?type: "([^"]+)";`,
    ).exec(text);
    if (!m) fail(`could not extract discriminator for interface ${interfaceName}`);
    return m[1];
  };
  const unionMembers = (unionName: string): string[] => {
    const m = new RegExp(`export type ${unionName} =([\\s\\S]*?);`).exec(text);
    if (!m) fail(`union ${unionName} not found in ${MISSING_TYPES_PATH}`);
    const members = [...m[1].matchAll(/\|\s*([A-Za-z0-9_]+)/g)].map((x) => x[1]);
    if (members.length === 0) fail(`union ${unionName} extracted empty`);
    return members;
  };
  return {
    client: unionMembers("ClientOnlyRenderBlock").map(tokenOf),
    server: unionMembers("ServerOnlyRenderBlock").map(tokenOf),
  };
}

/** Artifact registry vocabulary: canvasTypes, aliases, standalone aliases, kind facades. */
function readArtifactRegistryVocab(): { names: string[]; facadeKinds: string[] } {
  const text = readFileSync(ARTIFACT_REGISTRY_PATH, "utf8");
  const defsStart = text.indexOf("export const ARTIFACT_TYPE_DEFS");
  if (defsStart < 0) fail("ARTIFACT_TYPE_DEFS not found in artifact-type-registry.ts");
  const defs = text.slice(defsStart);
  const names = new Set<string>();
  for (const m of defs.matchAll(/canvasType: "([^"]+)"/g)) names.add(m[1]);
  for (const m of defs.matchAll(/(?:aliases|standaloneAliases): \[([^\]]*)\]/g)) {
    for (const s of m[1].matchAll(/"([^"]+)"/g)) names.add(s[1]);
  }
  const facadeKinds = new Set<string>();
  for (const m of defs.matchAll(/kinds: \[([^\]]*)\]/g)) {
    for (const s of m[1].matchAll(/"([^"]+)"/g)) facadeKinds.add(s[1]);
  }
  if (names.size === 0) fail("artifact registry vocabulary extracted empty");
  return { names: [...names], facadeKinds: [...facadeKinds] };
}

/** content-prefilter's own frozen tag sets (mirrors the accumulator's). */
function readPrefilterTokens(): VocabItem[] {
  const text = readFileSync(PREFILTER_PATH, "utf8");
  const items: VocabItem[] = [];
  for (const literal of ["SIMPLE_XML_TAGS", "ATTR_XML_TAGS"]) {
    const m = new RegExp(`const ${literal} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(text);
    if (!m) fail(`${literal} literal not found in content-prefilter.ts`);
    for (const s of m[1].matchAll(/"([^"]+)"/g)) {
      items.push({ name: s[1], source: `detector:content-prefilter.ts#${literal}` });
    }
  }
  if (items.length === 0) fail("content-prefilter tokens extracted empty");
  return items;
}

interface DbKindRow {
  kind: string;
  is_active: boolean;
  metadata: unknown;
}
interface DbSurfaceRow {
  surface_type: string;
  token: string;
  kind_definition_id: string;
}

interface DbVocab {
  /** slug → { family, isActive } */
  kinds: Map<string, { family: string | null; isActive: boolean }>;
  /** surface token → { surfaceType, kind } */
  surfaces: Map<string, { surfaceTypes: string[]; kinds: string[] }>;
}

function familyOf(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
  const family = (metadata as Record<string, unknown>).family;
  return typeof family === "string" ? family : null;
}

async function fetchDbVocab(): Promise<DbVocab> {
  dotenv.config({ path: resolve(ROOT, ".env.local") });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    fail("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local)");
  }
  const supabase = createClient(url, key);
  const [kindsRes, surfacesRes] = await Promise.all([
    supabase
      .schema("content_ir")
      .from("kind_definition")
      .select("kind,is_active,metadata")
      .is("deleted_at", null),
    supabase
      .schema("content_ir")
      .from("kind_surface")
      .select("surface_type,token,kind_definition_id")
      .is("deleted_at", null),
  ]);
  if (kindsRes.error) fail(`read content_ir.kind_definition: ${kindsRes.error.message}`);
  if (surfacesRes.error) fail(`read content_ir.kind_surface: ${surfacesRes.error.message}`);

  // Need id→slug to resolve surface targets.
  const idRes = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id,kind")
    .is("deleted_at", null);
  if (idRes.error) fail(`read kind_definition ids: ${idRes.error.message}`);
  const slugById = new Map<string, string>(
    ((idRes.data ?? []) as Array<{ id: string; kind: string }>).map((r) => [r.id, r.kind]),
  );

  const kinds = new Map<string, { family: string | null; isActive: boolean }>();
  for (const row of (kindsRes.data ?? []) as DbKindRow[]) {
    kinds.set(row.kind, { family: familyOf(row.metadata), isActive: row.is_active });
  }
  const surfaces = new Map<string, { surfaceTypes: string[]; kinds: string[] }>();
  for (const row of (surfacesRes.data ?? []) as DbSurfaceRow[]) {
    const target = slugById.get(row.kind_definition_id);
    if (!target) fail(`kind_surface token "${row.token}" points at unknown kind_definition id`);
    const entry = surfaces.get(row.token) ?? { surfaceTypes: [], kinds: [] };
    if (!entry.surfaceTypes.includes(row.surface_type)) entry.surfaceTypes.push(row.surface_type);
    if (!entry.kinds.includes(target)) entry.kinds.push(target);
    surfaces.set(row.token, entry);
  }
  if (kinds.size === 0) fail("live kind_definition returned zero rows");
  return { kinds, surfaces };
}

// ─── Build ──────────────────────────────────────────────────────────────────

interface BuildResult {
  file: CrosswalkFile;
  unclassified: string[];
  problems: string[];
}

async function build(): Promise<BuildResult> {
  const inputs: Record<string, string> = {};
  const items: VocabItem[] = [];
  const problems: string[] = [];

  // 1. Python BlockType (aidream) — degrade LOUDLY when aidream is absent.
  const pythonBlockTypes = readPythonBlockTypes();
  const typedRenderBlockTypes = readTypedRenderBlockTypes();
  if (pythonBlockTypes) {
    inputs["aidream:block_type"] = `${pythonBlockTypes.length} values (${BLOCKTYPE_PY})`;
    for (const name of pythonBlockTypes) items.push({ name, source: "aidream:block_type" });
    // Twin sanity: the generated TS union must mirror the Python enum exactly.
    const py = new Set(pythonBlockTypes);
    const ts = new Set(typedRenderBlockTypes);
    const onlyPy = [...py].filter((v) => !ts.has(v));
    const onlyTs = [...ts].filter((v) => !py.has(v));
    if (onlyPy.length > 0 || onlyTs.length > 0) {
      problems.push(
        `BlockType enum ≠ TYPED_RENDER_BLOCK_TYPES: python-only [${onlyPy.join(", ")}], ts-only [${onlyTs.join(", ")}] — regenerate stream types`,
      );
    }
  } else {
    inputs["aidream:block_type"] =
      "UNAVAILABLE — aidream repo not found; BlockType coverage derived from the generated TypedRenderBlock union only";
    console.error(
      `\x1b[33m\x1b[1mWARNING:\x1b[0m aidream not found at ${AIDREAM_ROOT} — Python BlockType read skipped (generated union used as its mirror). Set AIDREAM_ROOT if this is wrong.`,
    );
  }

  // 2. Generated TypedRenderBlock union.
  inputs["frontend:typed_render_block"] = `${typedRenderBlockTypes.length} types (types/python-generated/stream-events.ts)`;
  for (const name of typedRenderBlockTypes) {
    items.push({ name, source: "frontend:typed_render_block" });
  }

  // 3. Client-only / server-only render blocks.
  const missing = readMissingTypeTokens();
  inputs["frontend:client_only_render_block"] = `${missing.client.length} types (types/python-generated/missing-types.ts)`;
  inputs["frontend:server_only_render_block"] = `${missing.server.length} types (types/python-generated/missing-types.ts)`;
  for (const name of missing.client) items.push({ name, source: "frontend:client_only_render_block" });
  for (const name of missing.server) items.push({ name, source: "frontend:server_only_render_block" });

  // 4. Artifact type registry.
  const artifact = readArtifactRegistryVocab();
  inputs["frontend:artifact_registry"] = `${artifact.names.length} names + ${artifact.facadeKinds.length} kind facades (features/canvas/artifact-types/artifact-type-registry.ts)`;
  for (const name of artifact.names) items.push({ name, source: "frontend:artifact_registry" });
  for (const name of artifact.facadeKinds) {
    items.push({ name, source: "frontend:artifact_registry_kinds" });
  }

  // 5. Detector tokens — the shared shape-doctor extraction + content-prefilter.
  const detector = extractDetectorTokensFromTexts({
    accumulatorText: readFileSync(ACCUMULATOR_PATH, "utf8"),
    splitterText: readFileSync(SPLITTER_PATH, "utf8"),
  });
  for (const f of detector.failures) {
    problems.push(`detector literal ${f.literal} missing from ${f.file} — census blind`);
  }
  for (const t of detector.tokens) items.push({ name: t.token, source: `detector:${t.source}` });
  const prefilterTokens = readPrefilterTokens();
  items.push(...prefilterTokens);
  // The splitter's MatrxEnvelope special-case is code, not a literal — declare it.
  items.push({ name: "matrx", source: "detector:content-splitter-v2.ts#isMatrxEnvelope" });
  inputs["frontend:detectors"] = `${detector.tokens.length} frozen-literal tokens + ${prefilterTokens.length} prefilter tokens + matrx envelope`;

  // 6. Live DB registry.
  const db = await fetchDbVocab();
  inputs["db:kind_definition"] = `${db.kinds.size} live kind slugs (content_ir.kind_definition)`;
  inputs["db:kind_surface"] = `${db.surfaces.size} live surface tokens (content_ir.kind_surface)`;
  for (const slug of db.kinds.keys()) items.push({ name: slug, source: "db:kind_definition" });
  for (const [token, entry] of db.surfaces) {
    for (const st of entry.surfaceTypes) items.push({ name: token, source: `db:kind_surface:${st}` });
  }

  // 7. Contract manifest snapshot (all four generated families).
  let manifest: ContractManifestSnapshot | null = null;
  if (existsSync(MANIFEST_PATH)) {
    try {
      manifest = parseContractManifestSnapshot(readFileSync(MANIFEST_PATH, "utf8"));
    } catch (err) {
      problems.push(
        `contract manifest snapshot unreadable: ${err instanceof Error ? err.message : String(err)} — run pnpm check:shapes:manifest:refresh`,
      );
    }
  } else {
    problems.push(
      "contract manifest snapshot missing (scripts/shape/content-ir-contract-manifest.json) — run pnpm check:shapes:manifest:refresh",
    );
  }
  if (manifest) {
    inputs["aidream:contract_manifest"] = `${manifest.contracts.length} contracts (${manifest.generated_for})`;
    for (const c of manifest.contracts) {
      items.push({ name: c.kind, source: `aidream:contract_manifest:${c.family}` });
    }
  } else {
    inputs["aidream:contract_manifest"] = "UNAVAILABLE — snapshot missing/unreadable (recorded as a problem)";
  }

  // ── Merge to unique names ──
  const sourcesByName = new Map<string, Set<string>>();
  for (const item of items) {
    const set = sourcesByName.get(item.name) ?? new Set<string>();
    set.add(item.source);
    sourcesByName.set(item.name, set);
  }

  // Surface-token targets double as dynamic aliases; verify no conflict with static ones.
  const surfaceAlias = new Map<string, string>();
  for (const [token, entry] of db.surfaces) {
    if (entry.kinds.length > 1) {
      problems.push(`surface token "${token}" maps to MULTIPLE kinds: ${entry.kinds.join(", ")}`);
      continue;
    }
    surfaceAlias.set(token, entry.kinds[0]);
    const staticTarget = KIND_ALIASES.get(token);
    if (staticTarget && staticTarget !== entry.kinds[0]) {
      problems.push(
        `alias conflict for "${token}": static table says ${staticTarget}, kind_surface says ${entry.kinds[0]}`,
      );
    }
  }

  // ── Classify ──
  const rows: CrosswalkRow[] = [];
  const unclassified: string[] = [];
  const liveKind = (slug: string): { family: string | null; isActive: boolean } | undefined =>
    db.kinds.get(slug);

  for (const name of [...sourcesByName.keys()].sort((a, b) => a.localeCompare(b, "en"))) {
    const sources = [...(sourcesByName.get(name) ?? [])].sort((a, b) => a.localeCompare(b, "en"));
    const live = liveKind(name);
    const base = { name, sources, family: live?.family ?? null };

    const protocolRationale = PROTOCOL_ITEMS.get(name);
    if (protocolRationale !== undefined) {
      rows.push({
        ...base,
        classification: "protocol",
        kind: null,
        registered: live !== undefined,
        rationale: protocolRationale,
      });
      continue;
    }
    const scalarRationale = SCALAR_GENERIC_ITEMS.get(name);
    if (scalarRationale !== undefined) {
      rows.push({
        ...base,
        classification: "scalar_generic",
        kind: null,
        registered: live !== undefined,
        rationale: scalarRationale,
      });
      continue;
    }
    const opaqueRationale = OPAQUE_ITEMS.get(name);
    if (opaqueRationale !== undefined) {
      rows.push({
        ...base,
        classification: "intentionally_opaque",
        kind: null,
        registered: live !== undefined,
        rationale: opaqueRationale,
      });
      continue;
    }
    if (live) {
      const generated = live.family !== null && GENERATED_CONTRACT_FAMILIES.has(live.family);
      rows.push({
        ...base,
        classification: "shape",
        kind: name,
        registered: true,
        rationale: generated
          ? `generated ${live.family ?? ""} contract — data-only Shape published by the aidream contract publisher`
          : `registered kind (content_ir.kind_definition${live.isActive ? ", active" : ", inactive"})`,
      });
      continue;
    }
    const aliasTarget = KIND_ALIASES.get(name) ?? surfaceAlias.get(name);
    if (aliasTarget !== undefined) {
      const target = liveKind(aliasTarget);
      if (!target) {
        problems.push(`alias "${name}" targets kind "${aliasTarget}" which does not exist live`);
      }
      rows.push({
        ...base,
        classification: "shape",
        kind: aliasTarget,
        registered: target !== undefined,
        family: target?.family ?? null,
        rationale: `legacy/detector/artifact alias of registered kind "${aliasTarget}"`,
      });
      continue;
    }
    const candidateRationale = SHAPE_CANDIDATES.get(name);
    if (candidateRationale !== undefined) {
      rows.push({
        ...base,
        classification: "shape",
        kind: null,
        registered: false,
        rationale: candidateRationale,
      });
      continue;
    }
    unclassified.push(name);
  }

  const totals: CrosswalkFile["totals"] = {
    items: rows.length,
    shape: 0,
    protocol: 0,
    scalar_generic: 0,
    intentionally_opaque: 0,
  };
  for (const row of rows) totals[row.classification] += 1;

  const sortedInputs = Object.fromEntries(
    Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b, "en")),
  );
  const hashCore = JSON.stringify({ inputs: sortedInputs, rows });
  const stamp = `${rows.length}-items+${createHash("sha256").update(hashCore).digest("hex").slice(0, 12)}`;

  return {
    file: {
      _generated:
        "GENERATED by pnpm check:shapes:crosswalk:refresh (scripts/shape/generate-content-vocab-crosswalk.ts) — do not hand-edit; the classification authority is that script's rule tables.",
      generated_for: stamp,
      inputs: sortedInputs,
      totals,
      rows,
    },
    unclassified,
    problems,
  };
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const check = argv.includes("--check");

  const { file, unclassified, problems } = await build();

  let failures = 0;
  if (unclassified.length > 0) {
    failures += unclassified.length;
    console.error(
      `\x1b[31m\x1b[1m✗ ${unclassified.length} UNCLASSIFIED vocabulary item(s):\x1b[0m`,
    );
    for (const name of unclassified) console.error(`    ${name}`);
    console.error(
      "  Every named content vocabulary item MUST be classified — add it to the correct rule table in scripts/shape/generate-content-vocab-crosswalk.ts.",
    );
  }
  for (const p of problems) {
    failures += 1;
    console.error(`\x1b[31m\x1b[1m✗ problem:\x1b[0m ${p}`);
  }

  if (check) {
    if (!existsSync(CROSSWALK_PATH)) {
      console.error(
        `\x1b[31m\x1b[1m✗ committed crosswalk missing\x1b[0m (${CROSSWALK_PATH}) — run pnpm check:shapes:crosswalk:refresh and commit`,
      );
      failures += 1;
    } else {
      const committed = readFileSync(CROSSWALK_PATH, "utf8");
      const regenerated = `${JSON.stringify(file, null, 2)}\n`;
      if (committed !== regenerated) {
        console.error(
          `\x1b[31m\x1b[1m✗ crosswalk drift\x1b[0m — committed content-vocab-crosswalk.json differs from a fresh regeneration (${file.generated_for}); run pnpm check:shapes:crosswalk:refresh and commit`,
        );
        failures += 1;
      }
    }
  } else {
    writeFileSync(CROSSWALK_PATH, `${JSON.stringify(file, null, 2)}\n`);
    console.log(`  wrote ${CROSSWALK_PATH}`);
  }

  const t = file.totals;
  const line = `${t.items} items · shape ${t.shape} / protocol ${t.protocol} / scalar_generic ${t.scalar_generic} / intentionally_opaque ${t.intentionally_opaque} · ${unclassified.length} unclassified`;
  if (failures === 0) {
    console.log(`\x1b[32m\x1b[1m✓ content-vocab crosswalk:\x1b[0m ${line} (${file.generated_for})`);
    return 0;
  }
  console.error(`\x1b[31m\x1b[1mcontent-vocab crosswalk:\x1b[0m ${line} · ${failures} failure(s)`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      `\x1b[31m\x1b[1mgenerate-content-vocab-crosswalk FAILED:\x1b[0m`,
      err instanceof Error ? err.message : err,
    );
    process.exit(2);
  });
