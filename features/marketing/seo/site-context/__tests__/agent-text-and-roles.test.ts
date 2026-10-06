// The exact text an agent receives is rebuilt byte for byte, and a page role is
// read and written the way the server reads it (offers, never blocks; never
// drops the rest of the stored plan).

import { budgetedBytes, contextParts, pythonJsonText } from "../agent-view";
import {
  keywordPlanOf,
  keywordPlanWithRole,
  readPageRole,
  vocabularyFromKnobs,
} from "../page-roles";

describe("pythonJsonText", () => {
  // Expected strings produced by Python: json.dumps(value, ensure_ascii=False)
  // and len(json.dumps(text).encode()) — the server's tool_output_text and
  // agent_reach._rendered_bytes.
  const value = {
    status: "ok",
    data: {
      site: { name: "Café", n: null },
      goals: { source: "x", total: 0, items: [], note: "none recorded — the brand has no active initiative" },
      list: [1, 2.5, true, false],
    },
    notices: ['a "q"\nline'],
  };
  const PYTHON =
    '{"status": "ok", "data": {"site": {"name": "Café", "n": null}, "goals": {"source": "x", "total": 0, "items": [], "note": "none recorded — the brand has no active initiative"}, "list": [1, 2.5, true, false]}, "notices": ["a \\"q\\"\\nline"]}';

  it("matches Python's json.dumps for the same data", () => {
    expect(pythonJsonText(value)).toBe(PYTHON);
  });

  it("measures size the way the server budgets it (non-ASCII escaped)", () => {
    expect(budgetedBytes(PYTHON)).toBe(288);
  });
});

describe("contextParts", () => {
  it("names each part's source, its empty note, and the paging cut", () => {
    const parts = contextParts({
      goals: { source: "marketing.initiative", total: 0, items: [], note: "none recorded — x" },
      competitors: { source: "seo.competitor", total: 30, items: [{}, {}], more: 28, next: "context part='competitors' offset=2" },
    });
    expect(parts).toEqual([
      { name: "goals", source: "marketing.initiative", total: 0, shown: 0, more: null, next: null, note: "none recorded — x" },
      { name: "competitors", source: "seo.competitor", total: 30, shown: 2, more: 28, next: "context part='competitors' offset=2", note: null },
    ]);
  });
});

describe("page roles", () => {
  const vocab = vocabularyFromKnobs(["Hub", "spoke", "money", ""], { supporting: "Spoke", bad: "" });

  it("builds the vocabulary from the two knob values", () => {
    expect(vocab).toEqual({ allowed: ["hub", "spoke", "money"], aliases: { supporting: "spoke" } });
  });

  it("reads allowed, alias and outside words; keeps an outside word as recorded", () => {
    expect(readPageRole("Money", vocab)).toEqual({ kind: "allowed", stored: "Money", role: "money" });
    expect(readPageRole("supporting", vocab)).toEqual({ kind: "alias", stored: "supporting", role: "spoke" });
    expect(readPageRole("Pillar", vocab)).toEqual({ kind: "outside", stored: "Pillar", role: "Pillar" });
    expect(readPageRole("  ", vocab).kind).toBe("none");
  });

  it("a role write keeps every other key of the stored plan", () => {
    const stored = keywordPlanOf({
      keyword_plan: { page_role: "hub", primary_keyword_id: "k1", agent_note: "kept" },
      other: 1,
    });
    expect(keywordPlanWithRole(stored, "money")).toEqual({
      page_role: "money",
      primary_keyword_id: "k1",
      agent_note: "kept",
    });
    expect(keywordPlanWithRole(stored, null)).toEqual({ primary_keyword_id: "k1", agent_note: "kept" });
    expect(keywordPlanWithRole({ page_role: "hub" }, null)).toBeUndefined();
  });
});
