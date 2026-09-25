/**
 * ROUND TRIP: a kit, installed (ids minted, fields stored the way the record store
 * keeps them), then saved again, is the same kit — ignoring ids.
 *
 * The "installed" side is built the way the store actually holds it (measured on
 * the live store 2026-09-25): a long text is `type: text` + `format: long`, a
 * choice list is `type: list` + `parity_type: select` with its options in a table,
 * an entity reference is `type: relation` + `config.allowed_types`.
 */
import { buildManifest, type Snapshot, type SnapshotField } from "../serialize";
import type { KitFieldSpec, KitManifest } from "../types";

const ORIGINAL: KitManifest = {
  schema_version: 1,
  version: 1,
  key: "model-picks",
  name: "AI Model Picks",
  tagline: "Which model for what",
  description: "A table of purposes, each pointing at a real model.",
  category: "AI setup",
  icon: "cpu",
  teaches: ["A whole table becomes one variable."],
  tables: [
    {
      key: "model_picks",
      name: "Model Picks",
      description: "One row per kind of job.",
      fields: [
        { key: "purpose", label: "Purpose", type: "text", sort: 10, required: true },
        { key: "model", label: "Model", type: "entity_reference", sort: 20, required: true, allowedTypes: ["ai_model"] },
        { key: "why", label: "Why this model", type: "long_text", sort: 30 },
        { key: "cost_tier", label: "Cost", type: "select", sort: 40, options: ["Cheapest", "Moderate", "Premium"] },
      ],
      records: [
        { purpose: "Everyday work", model: { token: "ai_model", id: "b32f2079-4fa5-4613-a01d-726f1243ebe5" }, why: "Fast.", cost_tier: "Moderate" },
        { purpose: "Hardest problems", model: { token: "ai_model", id: "bc43581f-c7a6-4fd5-aa6a-8267074f480e" }, why: "Smart.", cost_tier: "Premium" },
      ],
    },
  ],
  agents: [
    {
      key: "agent",
      source_agent_id: "SOURCE",
      name: "My Agent Builder",
      description: "Builds agents.",
      bindings: [
        {
          variable: "model_selection_guidance",
          binding: {
            kind: "merge_field",
            source: "record",
            semantic_type: "collection",
            table_key: "model_picks",
            limit: 40,
            transform: { name: "list", template: "- {purpose}: {model.name}", join: "\n", max: 40 },
            missing: "absent",
            override_policy: "shown_locked",
          },
        },
      ],
    },
  ],
  workflows: [
    {
      key: "build_an_agent",
      name: "Build an agent",
      description: "Describe it; it builds it.",
      definition: { nodes: [{ id: "run", data: { input: { agent_id: "{{agent:agent}}", table: "{{table:model_picks}}" } } }], edges: [] },
    },
  ],
  guide: [{ title: "Your table", body: "Edit a row." }],
};

/** How the store holds a kit column once installed. */
function stored(spec: KitFieldSpec): SnapshotField {
  const base = { key: spec.key, label: spec.label, sort: spec.sort ?? null, required: !!spec.required, multi: false };
  switch (spec.type) {
    case "long_text":
      return { ...base, type: "text", format: "long", config: { multiline: true } };
    case "select":
      return { ...base, type: "list", parity_type: "select", config: { options_table_id: "OPT" }, options: spec.options ?? [] };
    case "entity_reference":
      return { ...base, type: "relation", config: { target_mode: "any", allowed_types: spec.allowedTypes ?? [] } };
    default:
      return { ...base, type: spec.type, config: {} };
  }
}

function install(m: KitManifest): Snapshot {
  const TABLE_ID = "11111111-1111-4111-8111-111111111111";
  const AGENT_ID = "22222222-2222-4222-8222-222222222222";
  const t = m.tables[0]!;
  const b = m.agents[0]!.bindings[0]!;
  const { table_key: _k, record_index: _i, ...rest } = b.binding;
  return {
    agent: {
      id: AGENT_ID,
      name: "My Agent Builder",
      variableDefinitions: [
        { name: "model_selection_guidance", defaultValue: null, binding: { ...rest, table_id: TABLE_ID } },
        { name: "prompt_purpose", defaultValue: "" },
      ],
    },
    tables: [
      {
        id: TABLE_ID,
        name: t.name,
        description: t.description,
        fields: t.fields.map(stored),
        // The store decorates an entity reference with a display `label` on read.
        rows: t.records.map((r, i) => ({
          id: `rec-${i}`,
          document: { ...r, model: { ...(r.model as object), label: "decorated" }, _values: {} },
        })),
      },
    ],
    workflows: [
      {
        id: "wf-1",
        name: m.workflows[0]!.name,
        description: m.workflows[0]!.description,
        definition: JSON.parse(
          JSON.stringify(m.workflows[0]!.definition)
            .replace("{{agent:agent}}", AGENT_ID)
            .replace("{{table:model_picks}}", TABLE_ID),
        ) as unknown,
      },
    ],
  };
}

describe("kit manifest round trip", () => {
  it("an installed kit saves back to the same manifest, ignoring ids", () => {
    const snapshot = install(ORIGINAL);
    const { manifest, notes } = buildManifest(snapshot, {
      key: ORIGINAL.key,
      name: ORIGINAL.name,
      tagline: ORIGINAL.tagline,
      description: ORIGINAL.description,
      category: ORIGINAL.category,
      icon: ORIGINAL.icon,
      teaches: ORIGINAL.teaches,
      guide: ORIGINAL.guide,
      agentName: ORIGINAL.agents[0]!.name,
      agentDescription: ORIGINAL.agents[0]!.description,
    });
    expect(notes).toEqual([]);
    expect(manifest.tables).toEqual(ORIGINAL.tables);
    expect(manifest.workflows).toEqual(ORIGINAL.workflows);
    // The saved kit forks the agent that was saved.
    expect(manifest.agents[0]!.source_agent_id).toBe(snapshot.agent.id);
    expect({ ...manifest.agents[0], source_agent_id: "SOURCE" }).toEqual(ORIGINAL.agents[0]);
  });

  it("a column pointing at a table outside the kit is left out, and says so", () => {
    const snapshot = install(ORIGINAL);
    snapshot.tables[0]!.fields.push({ key: "owner", label: "Owner", type: "relation", config: {}, relation_target: "elsewhere" });
    const { manifest, notes } = buildManifest(snapshot, {
      key: "k", name: "n", tagline: "t", description: "", category: "c", icon: "cpu", teaches: [], guide: [],
      agentName: "a", agentDescription: "",
    });
    expect(manifest.tables[0]!.fields.map((f) => f.key)).not.toContain("owner");
    expect(notes.join(" ")).toMatch(/Owner/);
  });
});
