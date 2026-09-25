// features/kits/serialize.ts — a person's setup → a KitManifest (pure; no I/O).
//
// "Save as kit" reads the store (snapshot.ts) and hands this module plain data:
// the tables the agent's bindings read (their field documents and rows), the agent's
// raw variable definitions and any workflows that reference them. This turns every
// id back into a kit-local KEY so the installer can mint fresh ones:
//   table ids      → table keys          (bindings: table_key; workflows: {{table:key}})
//   record ids     → record indexes      (bindings: record_index; relations: {table_key, record_index})
//   the agent id   → {{agent:key}}       (source_agent_id stays the real id — the installer forks it)
// Entity references to PLATFORM records ({token, id}) are kept as they are.

import type {
  KitAgent,
  KitBinding,
  KitFieldSpec,
  KitGuideStep,
  KitManifest,
  KitTable,
  KitWorkflow,
  MergeFieldBinding,
} from "./types";

// ─── inputs ─────────────────────────────────────────────────────────────────

/** A column as the store keeps it (the Field document), reduced to what a kit needs. */
export interface SnapshotField {
  key: string;
  label: string;
  /** The behaviour word the store keeps: text · list · relation · range · boolean · … */
  type: string;
  parity_type?: string | null;
  format?: string | null;
  config?: Record<string, unknown> | null;
  required?: boolean;
  multi?: boolean;
  sort?: number | null;
  unit?: string | null;
  relation_target?: string | null;
  /** A choice list's choices, read from its options table. */
  options?: string[];
}

export interface SnapshotTable {
  id: string;
  name: string;
  description: string;
  fields: SnapshotField[];
  /** Rows to include as example data, in order ({id, document}). Empty = starts empty. */
  rows: { id: string; document: Record<string, unknown> }[];
}

export interface SnapshotWorkflow {
  id: string;
  name: string;
  description: string;
  definition: unknown;
}

export interface KitMeta {
  key: string;
  name: string;
  tagline: string;
  description: string;
  category: string;
  icon: string;
  teaches: string[];
  guide: KitGuideStep[];
  agentName: string;
  agentDescription: string;
  tryIt?: KitAgent["try_it"];
}

export interface Snapshot {
  agent: { id: string; name: string; variableDefinitions: unknown };
  tables: SnapshotTable[];
  workflows: SnapshotWorkflow[];
}

// ─── keys ───────────────────────────────────────────────────────────────────

/** `My Sales Pipeline` → `my_sales_pipeline`, unique within `taken`. */
export function keyFor(name: string, taken: Set<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "item";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
  taken.add(key);
  return key;
}

/** A catalog key: lowercase words joined by '-'. */
export function slugFor(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "kit"
  );
}

// ─── the agent's bindings ───────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Every `{variable, binding}` on the agent that reads the record store. */
export function mergeFieldBindings(variableDefinitions: unknown): { variable: string; binding: MergeFieldBinding }[] {
  if (!Array.isArray(variableDefinitions)) return [];
  const out: { variable: string; binding: MergeFieldBinding }[] = [];
  for (const d of variableDefinitions) {
    if (!isRecord(d) || typeof d.name !== "string" || !isRecord(d.binding)) continue;
    const b = d.binding;
    if (b.kind !== "merge_field" || typeof b.table_id !== "string") continue;
    out.push({ variable: d.name, binding: b as unknown as MergeFieldBinding });
  }
  return out;
}

/** The tables the bindings read, plus the tables those tables' relations point at (one hop). */
export function tablesToInclude(
  bindings: { binding: MergeFieldBinding }[],
  fieldsByTable: Record<string, SnapshotField[]>,
): string[] {
  const ids = new Set(bindings.map((b) => b.binding.table_id));
  for (const id of [...ids]) {
    for (const f of fieldsByTable[id] ?? []) {
      if (f.relation_target) ids.add(f.relation_target);
    }
  }
  return [...ids];
}

// ─── columns ────────────────────────────────────────────────────────────────

const PARITY_WORDS = new Set([
  "select",
  "multi_select",
  "url",
  "email",
  "phone",
  "checkbox",
  "currency",
  "percent",
  "datetime",
]);

/**
 * One column in the words `declareTable` takes. Returns null (with the reason)
 * for a column a kit cannot carry — a relation to a table outside the kit, or a
 * worked-out column (formula / lookup / rollup), which the kit would have to
 * re-express against new ids.
 */
export function fieldToSpec(
  f: SnapshotField,
  tableKeyById: Record<string, string>,
): { spec: KitFieldSpec } | { skipped: string } {
  const base: KitFieldSpec = {
    key: f.key,
    label: f.label || f.key,
    type: "text",
    ...(typeof f.sort === "number" ? { sort: f.sort } : {}),
    ...(f.required ? { required: true } : {}),
  };
  const parity = f.parity_type ?? null;
  if (parity && ["formula", "lookup", "rollup"].includes(parity)) {
    return { skipped: `"${f.label}" is worked out from other columns, so it is left out` };
  }
  if (parity && PARITY_WORDS.has(parity)) {
    const spec: KitFieldSpec = { ...base, type: parity };
    if ((parity === "select" || parity === "multi_select") && f.options && f.options.length > 0) spec.options = f.options;
    if (f.unit) spec.unit = f.unit;
    return { spec };
  }
  switch (f.type) {
    case "relation": {
      const allowed = isRecord(f.config) && Array.isArray(f.config.allowed_types)
        ? (f.config.allowed_types as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      if (allowed.length > 0) {
        return { spec: { ...base, type: "entity_reference", allowedTypes: allowed, ...(f.multi ? { multi: true } : {}) } };
      }
      if (f.relation_target && tableKeyById[f.relation_target]) {
        return {
          spec: { ...base, type: "relation", relation_table_key: tableKeyById[f.relation_target], ...(f.multi ? { multi: true } : {}) },
        };
      }
      return { skipped: `"${f.label}" points at a table outside this kit, so it is left out` };
    }
    case "text": {
      const long = f.format === "long" || (isRecord(f.config) && f.config.multiline === true);
      return { spec: { ...base, type: long ? "long_text" : "text" } };
    }
    case "list":
      return { spec: { ...base, type: f.multi ? "multi_select" : "select", ...(f.options?.length ? { options: f.options } : {}) } };
    case "range":
      return { spec: { ...base, type: "number", ...(f.unit ? { unit: f.unit } : {}) } };
    case "boolean":
      return { spec: { ...base, type: "checkbox" } };
    default:
      return { spec: { ...base, type: f.type } };
  }
}

// ─── rows ───────────────────────────────────────────────────────────────────

/** A document → seed values: system keys dropped, relations to kit tables remapped. */
function rowToSeed(
  document: Record<string, unknown>,
  specs: KitFieldSpec[],
  recordIndex: Record<string, { table_key: string; record_index: number }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const spec of specs) {
    if (!(spec.key in document)) continue;
    const v = document[spec.key];
    if (v === null || v === undefined || v === "") continue;
    if (spec.type === "relation") {
      const map = (x: unknown) => (typeof x === "string" && recordIndex[x] ? recordIndex[x] : null);
      const mapped = Array.isArray(v) ? v.map(map).filter(Boolean) : map(v);
      if (mapped && (!Array.isArray(mapped) || mapped.length > 0)) out[spec.key] = mapped;
      continue;
    }
    out[spec.key] = v;
  }
  return out;
}

// ─── workflows ──────────────────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Ids → `{{agent:key}}` / `{{table:key}}`. */
export function placeholderize(definition: unknown, ids: Record<string, string>): unknown {
  let text = JSON.stringify(definition ?? {});
  for (const [id, placeholder] of Object.entries(ids)) {
    text = text.replace(new RegExp(escapeRegExp(id), "g"), placeholder);
  }
  return JSON.parse(text) as unknown;
}

/** Whether a workflow definition names any of these ids. */
export function workflowReferences(definition: unknown, ids: string[]): boolean {
  const text = JSON.stringify(definition ?? {});
  return ids.some((id) => text.includes(id));
}

// ─── the manifest ───────────────────────────────────────────────────────────

export interface BuildResult {
  manifest: KitManifest;
  /** What could not be carried, in plain sentences. */
  notes: string[];
}

export const AGENT_KEY = "agent";

export function buildManifest(snapshot: Snapshot, meta: KitMeta): BuildResult {
  const notes: string[] = [];
  const takenTableKeys = new Set<string>();
  const tableKeyById: Record<string, string> = {};
  for (const t of snapshot.tables) tableKeyById[t.id] = keyFor(t.name, takenTableKeys);

  // Every included row's place, so relations and record bindings become indexes.
  const recordIndex: Record<string, { table_key: string; record_index: number }> = {};
  for (const t of snapshot.tables) {
    t.rows.forEach((r, i) => {
      recordIndex[r.id] = { table_key: tableKeyById[t.id]!, record_index: i };
    });
  }

  const tables: KitTable[] = snapshot.tables.map((t) => {
    const specs: KitFieldSpec[] = [];
    for (const f of t.fields) {
      const r = fieldToSpec(f, tableKeyById);
      if ("spec" in r) specs.push(r.spec);
      else notes.push(`${t.name}: ${r.skipped}.`);
    }
    specs.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    return {
      key: tableKeyById[t.id]!,
      name: t.name,
      description: t.description,
      fields: specs,
      records: t.rows.map((r) => rowToSeed(r.document, specs, recordIndex)),
    };
  });

  const bindings: { variable: string; binding: KitBinding }[] = [];
  for (const { variable, binding } of mergeFieldBindings(snapshot.agent.variableDefinitions)) {
    const tableKey = tableKeyById[binding.table_id];
    if (!tableKey) {
      notes.push(`{{${variable}}} reads a table that is not in this kit, so its connection is left out.`);
      continue;
    }
    const { table_id: _t, record_id, ...rest } = binding;
    const kitBinding: KitBinding = { ...rest, table_key: tableKey };
    if (record_id) {
      const at = recordIndex[record_id];
      if (!at) {
        notes.push(`{{${variable}}} reads one row that is not included as example data, so its connection is left out.`);
        continue;
      }
      kitBinding.record_index = at.record_index;
    }
    bindings.push({ variable, binding: kitBinding });
  }

  const idToPlaceholder: Record<string, string> = { [snapshot.agent.id]: `{{agent:${AGENT_KEY}}}` };
  for (const [id, key] of Object.entries(tableKeyById)) idToPlaceholder[id] = `{{table:${key}}}`;
  const takenWf = new Set<string>();
  const workflows: KitWorkflow[] = snapshot.workflows.map((w) => ({
    key: keyFor(w.name, takenWf),
    name: w.name,
    description: w.description,
    definition: placeholderize(w.definition, idToPlaceholder),
  }));

  const agent: KitAgent = {
    key: AGENT_KEY,
    source_agent_id: snapshot.agent.id,
    name: meta.agentName,
    description: meta.agentDescription,
    bindings,
    ...(meta.tryIt ? { try_it: meta.tryIt } : {}),
  };

  return {
    manifest: {
      schema_version: 1,
      version: 1,
      key: meta.key,
      name: meta.name,
      tagline: meta.tagline,
      description: meta.description,
      category: meta.category,
      icon: meta.icon,
      teaches: meta.teaches.filter((t) => t.trim()),
      tables,
      agents: [agent],
      workflows,
      guide: meta.guide.filter((g) => g.title.trim() || g.body.trim()),
    },
    notes,
  };
}

/** A walkthrough drafted from what was detected — the person edits it. */
export function draftGuide(snapshot: Snapshot, agentName: string): KitGuideStep[] {
  const steps: KitGuideStep[] = [];
  for (const t of snapshot.tables) {
    steps.push({
      title: `Your ${t.name} table`,
      body: t.description || `This table holds the information the agent reads. Edit a row and the agent's next run follows it.`,
    });
  }
  steps.push({ title: `Your own ${agentName}`, body: `A copy of the agent, already connected to your tables. The original is never changed.` });
  for (const { variable, binding } of mergeFieldBindings(snapshot.agent.variableDefinitions)) {
    const t = snapshot.tables.find((x) => x.id === binding.table_id);
    if (!t) continue;
    steps.push({
      title: `The trick: {{${variable}}}`,
      body:
        binding.semantic_type === "collection"
          ? `{{${variable}}} is connected to the whole ${t.name} table: every row becomes one line the agent reads, on every run.`
          : binding.semantic_type === "value"
            ? `{{${variable}}} is connected to one value in ${t.name}. Change that cell and the next run uses it.`
            : `{{${variable}}} is connected to one row of ${t.name}.`,
    });
  }
  for (const w of snapshot.workflows) {
    steps.push({ title: `Try it: ${w.name}`, body: w.description || `Run the workflow and watch the agent use your data.` });
  }
  return steps;
}
