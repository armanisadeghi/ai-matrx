/**
 * compareAgentSyncSnapshots — the verdict behind the Linked Agent Sync panel.
 *
 * The panel used to show a "last synced" timestamp and offer Pull/Push without
 * ever comparing anything. These tests pin the replacement: identical /
 * differs / unknown, plus the per-field breakdown and the direction-aware
 * impact that decides whether Pull and Push are honest or pointless.
 *
 * Real shape from production (2026-08-09): the linked pair
 * "Deep Web Research Agent" (user, b9c9ded5-…) ↔ "Deep Research Specialist"
 * (builtin, 11fcc4f0-…, source_agent_id → the user agent). At snapshot time
 * every BEHAVIOR column matched byte-for-byte (verified via md5 over each
 * column) while `name` and `description` differed — the last sync was a Pull
 * with the identity checkbox off. That is the case the old UI got most wrong:
 * it invited a Pull that would have written nothing.
 */

import {
  agentSyncImpact,
  compareAgentSyncSnapshots,
  describeAgentSyncImpact,
} from "../compare";
import {
  AGENT_SYNC_FIELDS,
  toAgentSyncSnapshot,
  type AgentSyncSnapshot,
} from "../sync-fields";

// ── Production row shapes ───────────────────────────────────────────────────
// Values copied from agent.definition on 2026-08-09 (system prompt truncated;
// every container type is the real one).

const RESEARCH_TOOL_IDS = [
  "075194f7-3766-4ae7-a887-2234331b49c1",
  "55bc14b4-a166-4a33-a0bc-a2b0dcf66de0",
];

const RESEARCH_TAGS = [
  "web-research",
  "data-gathering",
  "information-retrieval",
  "search-optimization",
  "iterative-process",
  "fact-finding",
];

const RESEARCH_MESSAGES = [
  {
    role: "system",
    content: [
      {
        text: "You are an Expert Web Research Specialist with access to a powerful deep research tool.",
      },
    ],
  },
  {
    role: "user",
    content: [{ text: "{{research_request}}" }],
  },
];

const RESEARCH_SETTINGS = {
  stream: true,
  model_id: "114d67fd-b233-4498-ab01-7dfcf6f86bb2",
  reasoning_effort: "medium",
  reasoning_summary: "always",
  internal_web_search: true,
  internal_url_context: true,
};

/** A raw `agent.definition` row, snake_case, exactly as PostgREST returns it. */
function productionRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "b9c9ded5-9116-4fef-92a4-1576ee170832",
    name: "Deep Web Research Agent",
    description:
      "An expert research assistant that conducts thorough web research using iterative searches.",
    category: "Analysis & Research",
    tags: RESEARCH_TAGS,
    messages: RESEARCH_MESSAGES,
    variable_definitions: [],
    model_id: "114d67fd-b233-4498-ab01-7dfcf6f86bb2",
    model_tiers: null,
    settings: RESEARCH_SETTINGS,
    output_schema: null,
    tools: RESEARCH_TOOL_IDS,
    custom_tools: [],
    context_slots: [],
    mcp_servers: [],
    tool_config: { excluded_tools: [], auto_tools_disabled: false },
    skill_config: {},
    default_rag_boost: 0,
    rag_awareness_mode: "none",
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}): AgentSyncSnapshot {
  return toAgentSyncSnapshot(productionRow(overrides));
}

/** The real 2026-08-09 pair: behavior identical, identity divergent. */
const USER_SIDE = snapshot();
const SYSTEM_SIDE = snapshot({
  id: "11fcc4f0-62a0-4b39-a75e-fd2adf395192",
  name: "Deep Research Specialist",
  description:
    "An elite analytical partner designed to navigate the modern information landscape.",
});

describe("toAgentSyncSnapshot", () => {
  it("maps every synced column onto its camelCase field", () => {
    const snap = snapshot();
    for (const field of AGENT_SYNC_FIELDS) {
      expect(Object.prototype.hasOwnProperty.call(snap, field.field)).toBe(true);
    }
    expect(Object.keys(snap)).toHaveLength(AGENT_SYNC_FIELDS.length);
    expect(snap.variableDefinitions).toEqual([]);
    expect(snap.defaultRagBoost).toBe(0);
    expect(snap.ragAwarenessMode).toBe("none");
  });

  it("never carries a column the sync does not write", () => {
    // ui_gates / matrx_actions are real config columns the RPC skips.
    const snap = toAgentSyncSnapshot(
      productionRow({ ui_gates: { file_urls: true }, matrx_actions: { a: 1 } }),
    );
    expect(snap.uiGates).toBeUndefined();
    expect(snap.matrxActions).toBeUndefined();
  });

  it("normalizes a missing column to null on both sides equally", () => {
    const row = productionRow();
    delete row.model_tiers;
    expect(toAgentSyncSnapshot(row).modelTiers).toBeNull();
  });
});

describe("compareAgentSyncSnapshots — verdict", () => {
  it("reports identical when both sides carry the same values", () => {
    const result = compareAgentSyncSnapshots(snapshot(), snapshot());
    expect(result.verdict).toBe("identical");
    expect(result.changed).toEqual([]);
    expect(result.comparedFieldCount).toBe(AGENT_SYNC_FIELDS.length);
  });

  it("reports identical for a self-comparison of the production row", () => {
    expect(compareAgentSyncSnapshots(USER_SIDE, USER_SIDE).verdict).toBe(
      "identical",
    );
  });

  it("reports unknown — never identical — when a side cannot be read", () => {
    const missingSystem = compareAgentSyncSnapshots(USER_SIDE, null);
    expect(missingSystem.verdict).toBe("unknown");
    expect(missingSystem.unreadable).toEqual(["system"]);
    expect(missingSystem.changed).toEqual([]);

    const missingUser = compareAgentSyncSnapshots(null, SYSTEM_SIDE);
    expect(missingUser.verdict).toBe("unknown");
    expect(missingUser.unreadable).toEqual(["user"]);

    const missingBoth = compareAgentSyncSnapshots(null, null);
    expect(missingBoth.verdict).toBe("unknown");
    expect(missingBoth.unreadable).toEqual(["user", "system"]);
  });
});

describe("compareAgentSyncSnapshots — the real production pair", () => {
  const result = compareAgentSyncSnapshots(USER_SIDE, SYSTEM_SIDE);

  it("says they differ", () => {
    expect(result.verdict).toBe("differs");
  });

  it("names exactly the two identity fields that differ", () => {
    expect(result.changed.map((c) => c.field)).toEqual(["name", "description"]);
    expect(result.identityChanged.map((c) => c.label)).toEqual([
      "Name",
      "Description",
    ]);
  });

  it("finds no behavior difference — so a default Pull would write nothing", () => {
    expect(result.behaviorChanged).toEqual([]);
  });

  it("labels the changes for the summary", () => {
    expect(result.changed[0]).toMatchObject({
      field: "name",
      column: "name",
      label: "Name",
      group: "identity",
      changeType: "modified",
      orderOnly: false,
      changedCount: 1,
    });
  });
});

describe("compareAgentSyncSnapshots — per-field detection", () => {
  it("detects a system-prompt edit inside messages", () => {
    const edited = snapshot({
      messages: [
        {
          role: "system",
          content: [{ text: "You are a completely different agent." }],
        },
        RESEARCH_MESSAGES[1],
      ],
    });
    const result = compareAgentSyncSnapshots(snapshot(), edited);
    expect(result.verdict).toBe("differs");
    expect(result.behaviorChanged.map((c) => c.field)).toEqual(["messages"]);
    expect(result.behaviorChanged[0].label).toBe("System prompt & messages");
    expect(result.behaviorChanged[0].orderOnly).toBe(false);
  });

  it("detects a single changed key inside settings and counts it", () => {
    const edited = snapshot({
      settings: { ...RESEARCH_SETTINGS, reasoning_effort: "high" },
    });
    const result = compareAgentSyncSnapshots(snapshot(), edited);
    expect(result.changed.map((c) => c.field)).toEqual(["settings"]);
    expect(result.changed[0].changedCount).toBe(1);
  });

  it("counts two changed settings keys as two", () => {
    const edited = snapshot({
      settings: {
        ...RESEARCH_SETTINGS,
        reasoning_effort: "high",
        stream: false,
      },
    });
    const result = compareAgentSyncSnapshots(snapshot(), edited);
    expect(result.changed[0].changedCount).toBe(2);
  });

  it("detects an added tool", () => {
    const edited = snapshot({
      tools: [...RESEARCH_TOOL_IDS, "99999999-0000-0000-0000-000000000000"],
    });
    const result = compareAgentSyncSnapshots(snapshot(), edited);
    expect(result.changed.map((c) => c.field)).toEqual(["tools"]);
    expect(result.changed[0].orderOnly).toBe(false);
  });

  it("flags a reordered tools array as a difference, but marks it order-only", () => {
    const edited = snapshot({ tools: [...RESEARCH_TOOL_IDS].reverse() });
    const result = compareAgentSyncSnapshots(snapshot(), edited);
    // The sync copies the array verbatim, so this IS a write — never "identical".
    expect(result.verdict).toBe("differs");
    expect(result.changed[0].field).toBe("tools");
    expect(result.changed[0].orderOnly).toBe(true);
  });

  it("does not flag reordered variable definitions — matched by name", () => {
    const a = snapshot({
      variable_definitions: [{ name: "topic" }, { name: "depth" }],
    });
    const b = snapshot({
      variable_definitions: [{ name: "depth" }, { name: "topic" }],
    });
    expect(compareAgentSyncSnapshots(a, b).verdict).toBe("identical");
  });

  it("detects an edited variable definition matched by name", () => {
    const a = snapshot({
      variable_definitions: [{ name: "topic", required: true }],
    });
    const b = snapshot({
      variable_definitions: [{ name: "topic", required: false }],
    });
    const result = compareAgentSyncSnapshots(a, b);
    expect(result.changed.map((c) => c.field)).toEqual(["variableDefinitions"]);
    expect(result.changed[0].label).toBe("Variables");
  });

  it("distinguishes null from an empty container", () => {
    const result = compareAgentSyncSnapshots(
      snapshot({ variable_definitions: null }),
      snapshot({ variable_definitions: [] }),
    );
    expect(result.verdict).toBe("differs");
    expect(result.changed.map((c) => c.field)).toEqual(["variableDefinitions"]);
  });

  it("detects a model swap and a rag-boost change", () => {
    const result = compareAgentSyncSnapshots(
      snapshot(),
      snapshot({
        model_id: "00000000-0000-0000-0000-000000000001",
        default_rag_boost: 3,
      }),
    );
    expect(result.changed.map((c) => c.field)).toEqual([
      "modelId",
      "defaultRagBoost",
    ]);
  });

  it("does not ignore an underscore-prefixed key inside a message", () => {
    // The RPC copies messages verbatim — a __kind envelope difference is real.
    const a = snapshot({
      messages: [{ role: "system", content: [{ __kind: "plain", text: "hi" }] }],
    });
    const b = snapshot({
      messages: [{ role: "system", content: [{ __kind: "report", text: "hi" }] }],
    });
    expect(compareAgentSyncSnapshots(a, b).verdict).toBe("differs");
  });

  it("reports changed fields in declaration order, identity first", () => {
    const result = compareAgentSyncSnapshots(
      snapshot(),
      snapshot({
        default_rag_boost: 2,
        name: "Renamed",
        settings: { ...RESEARCH_SETTINGS, stream: false },
      }),
    );
    expect(result.changed.map((c) => c.field)).toEqual([
      "name",
      "settings",
      "defaultRagBoost",
    ]);
  });
});

describe("agentSyncImpact — what a given sync would actually overwrite", () => {
  const realPair = compareAgentSyncSnapshots(USER_SIDE, SYSTEM_SIDE);

  it("a behavior-only Pull on the real pair has nothing to sync", () => {
    const impact = agentSyncImpact(realPair, false);
    expect(impact.nothingToSync).toBe(true);
    expect(impact.count).toBe(0);
    expect(impact.unknown).toBe(false);
  });

  it("the same Pull WITH identity would overwrite name and description", () => {
    const impact = agentSyncImpact(realPair, true);
    expect(impact.nothingToSync).toBe(false);
    expect(impact.count).toBe(2);
    expect(impact.fields.map((f) => f.label)).toEqual(["Name", "Description"]);
  });

  it("a Push (always identity) on the real pair has work to do", () => {
    expect(agentSyncImpact(realPair, true).count).toBe(2);
  });

  it("an identical pair has nothing to sync in either mode", () => {
    const identical = compareAgentSyncSnapshots(snapshot(), snapshot());
    expect(agentSyncImpact(identical, false).nothingToSync).toBe(true);
    expect(agentSyncImpact(identical, true).nothingToSync).toBe(true);
  });

  it("never claims nothing-to-sync when the comparison is unknown", () => {
    const unknown = compareAgentSyncSnapshots(USER_SIDE, null);
    for (const includeIdentity of [false, true]) {
      const impact = agentSyncImpact(unknown, includeIdentity);
      expect(impact.unknown).toBe(true);
      expect(impact.nothingToSync).toBe(false);
    }
  });

  it("a behavior difference reaches a behavior-only Pull", () => {
    const cmp = compareAgentSyncSnapshots(
      snapshot(),
      snapshot({ model_id: "00000000-0000-0000-0000-000000000001" }),
    );
    expect(agentSyncImpact(cmp, false).fields.map((f) => f.label)).toEqual([
      "Model",
    ]);
  });
});

describe("describeAgentSyncImpact", () => {
  it("says nothing to sync when there is nothing to sync", () => {
    const identical = compareAgentSyncSnapshots(snapshot(), snapshot());
    expect(describeAgentSyncImpact(agentSyncImpact(identical, true), "My copy")).toBe(
      'Nothing to sync — "My copy" already matches for every field this would copy.',
    );
  });

  it("names what will be overwritten", () => {
    const cmp = compareAgentSyncSnapshots(USER_SIDE, SYSTEM_SIDE);
    expect(describeAgentSyncImpact(agentSyncImpact(cmp, true), "My copy")).toBe(
      'Overwrites 2 fields on "My copy": Name, Description.',
    );
  });

  it("admits it could not compare", () => {
    const unknown = compareAgentSyncSnapshots(null, SYSTEM_SIDE);
    expect(
      describeAgentSyncImpact(agentSyncImpact(unknown, true), "My copy"),
    ).toContain("Could not compare");
  });
});
