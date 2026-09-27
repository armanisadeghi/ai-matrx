/**
 * Mandate run history — the pure seams: reading the database's answer back
 * (every field narrowed, a run with no level recorded stays "not recorded"),
 * and the words a row prints for each seat. Shapes are real rows read from
 * production on 2026-09-27 (Quick Test Agent on flashcards.grade_typed_answer,
 * a workflow-held referral letter run).
 */
import { parseRunPage } from "../service";
import {
  costWords,
  durationWords,
  outputWarningTitle,
  ranByWords,
  relativeWhen,
  rungTitle,
  rungWords,
  RUNG_NOT_RECORDED,
} from "../format";

const conversationRow = {
  run_kind: "conversation",
  run_id: "771c65fa-4a38-4f13-8c45-00dd634c21f5",
  started_at: "2026-09-27T10:22:23.062644+00:00",
  completed_at: "2026-09-27T10:22:28.945227+00:00",
  status: "succeeded",
  raw_status: "completed",
  error: null,
  ran_by_id: "87a6e699-3622-4869-8843-d0867456c0dd",
  ran_by_name: "AI Matrx Admin",
  ran_by_kind: "person",
  organization_id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f",
  organization_name: "admin's Workspace",
  rung: null,
  holder_type: "agent",
  holder_id: "92c37a37-7630-4517-b2a2-b6f1d2427208",
  holder_name: "Quick Test Agent",
  holder_agent_type: "user",
  output_warned: false,
  output_missing_keys: [],
  cost: 0.026889,
  duration_ms: 6214,
  conversation_id: "035594c3-dff1-4302-bc3f-9e03922c941c",
};

const workflowRow = {
  ...conversationRow,
  run_kind: "workflow",
  run_id: "c7b71f9c-fcae-51cb-bc7e-c6775ac46171",
  rung: "org",
  holder_type: "workflow",
  holder_id: "256695b0-537e-4e80-a4b2-8fdd91557e59",
  holder_name: "Referral letter drafter",
  holder_agent_type: null,
  output_warned: true,
  output_missing_keys: ["letter"],
  cost: "0.0123",
  duration_ms: null,
  conversation_id: null,
};

describe("reading the run history answer", () => {
  it("narrows every field of a real conversation run", () => {
    const page = parseRunPage({ total: 9, rows: [conversationRow], facets: null });
    expect(page.total).toBe(9);
    expect(page.facets).toBeNull();
    const [run] = page.rows;
    expect(run.runKind).toBe("conversation");
    expect(run.rung).toBeNull();
    expect(run.holderType).toBe("agent");
    expect(run.cost).toBeCloseTo(0.026889);
    expect(run.conversationId).toBe(conversationRow.conversation_id);
  });

  it("reads a workflow run as a workflow Holder, with its warning and numeric cost", () => {
    const [run] = parseRunPage({ total: 1, rows: [workflowRow] }).rows;
    expect(run.runKind).toBe("workflow");
    expect(run.holderType).toBe("workflow");
    expect(run.rung).toBe("org");
    expect(run.outputWarned).toBe(true);
    expect(run.outputMissingKeys).toEqual(["letter"]);
    expect(run.cost).toBeCloseTo(0.0123);
    expect(run.durationMs).toBeNull();
  });

  it("keeps the org and platform views' facets", () => {
    const page = parseRunPage({
      total: 1,
      rows: [],
      facets: {
        organizations: [{ id: "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f", name: "admin's Workspace", count: 9 }],
        people: [{ id: "87a6e699-3622-4869-8843-d0867456c0dd", name: "AI Matrx Admin", count: 9 }],
      },
    });
    expect(page.facets?.organizations[0].count).toBe(9);
    expect(page.facets?.people[0].name).toBe("AI Matrx Admin");
  });

  it("drops a row with no identity instead of printing a blank run", () => {
    expect(parseRunPage({ total: 1, rows: [{ status: "succeeded" }] }).rows).toEqual([]);
  });

  it("refuses an answer that is not a page", () => {
    expect(() => parseRunPage(null)).toThrow();
    expect(() => parseRunPage([])).toThrow();
  });
});

describe("the words a row prints", () => {
  const [conversation, workflow] = parseRunPage({ total: 2, rows: [conversationRow, workflowRow] }).rows;

  it("says which level decided it — and never guesses for an old run", () => {
    expect(rungWords("system")).toBe("System");
    expect(rungWords("org")).toBe("Organization");
    expect(rungWords("user")).toBe("User");
    expect(rungWords(null)).toBe("—");
    expect(rungTitle(null)).toBe(RUNG_NOT_RECORDED);
  });

  it("names who ran it per seat, and says when the system ran it for someone", () => {
    expect(ranByWords(conversation, "mine")).toBe("You");
    expect(ranByWords(conversation, "platform")).toBe("AI Matrx Admin");
    expect(ranByWords({ ...conversation, ranByKind: "system" }, "org")).toBe("System · for AI Matrx Admin");
    expect(ranByWords({ ...conversation, ranByKind: "system", ranById: null }, "org")).toBe("System");
  });

  it("prints cost, duration and time compactly", () => {
    expect(costWords(0.026889)).toBe("$0.0269");
    expect(costWords(1.5)).toBe("$1.50");
    expect(costWords(null)).toBe("—");
    expect(durationWords(6214)).toBe("6.2s");
    expect(durationWords(850)).toBe("850ms");
    expect(durationWords(125_000)).toBe("2m 05s");
    expect(durationWords(null)).toBe("—");
    const now = Date.parse("2026-09-27T10:25:23Z");
    expect(relativeWhen("2026-09-27T10:22:23Z", now)).toBe("3m ago");
    expect(relativeWhen("2026-09-27T07:25:23Z", now)).toBe("3h ago");
  });

  it("names the missing output keys on a warned run", () => {
    expect(outputWarningTitle(conversation)).toBeNull();
    expect(outputWarningTitle(workflow)).toContain("letter");
  });
});
