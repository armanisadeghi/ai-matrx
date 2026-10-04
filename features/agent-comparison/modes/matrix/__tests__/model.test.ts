import {
  breakEven,
  entryToCell,
  metadataToSetup,
  parsePastedPrompts,
  realToolCalls,
  resolvePatch,
  rowUsedTools,
  setupProblems,
  setupToMetadata,
  emptySetup,
} from "../model";
import type { ComparisonEntryRow } from "../../../types";

describe("resolvePatch", () => {
  it("lets the last present scalar win, null clears, settings/variables merge", () => {
    const out = resolvePatch(
      { agent_id: "a", model_id: "m1", settings: { temperature: 1 }, variables: { x: "1" } },
      { model_id: null, settings: { max_output_tokens: 10 } },
      { settings: { temperature: 0.2 }, variables: { y: "2" } },
    );
    expect(out.agent_id).toBe("a");
    expect(out.model_id).toBeNull();
    expect(out.settings).toEqual({ temperature: 0.2, max_output_tokens: 10 });
    expect(out.variables).toEqual({ x: "1", y: "2" });
  });

  it("unions tool adds, and remove wins so the sets never overlap", () => {
    const out = resolvePatch(
      { tools_add: ["web", "memory"] },
      { tools_add: ["bundle:list_google"], tools_remove: ["memory"] },
    );
    expect(out.tools_add).toEqual(["web", "bundle:list_google"]);
    expect(out.tools_remove).toEqual(["memory"]);
  });
});

describe("setup round trip", () => {
  it("reads back exactly what it writes", () => {
    const s = emptySetup();
    s.base = { agent_id: "a", tools_add: ["web"] };
    s.rows.variants = [{ id: "r1", label: "one", patch: { user_input: "hi" } }];
    s.columns = { label: "Arms", variants: [{ id: "c1", label: "bundles", patch: { auto_tools: false } }] };
    s.repeats = 3;
    const md = JSON.parse(JSON.stringify(setupToMetadata(s)));
    expect(md.mode).toBe("matrix");
    expect(metadataToSetup(md)).toEqual(s);
    expect(setupProblems(s)).toEqual([]);
  });

  it("names cells with no agent", () => {
    const s = emptySetup();
    s.rows.variants = [{ id: "r", label: "r", patch: {} }];
    s.columns.variants = [{ id: "c", label: "c", patch: {} }];
    expect(setupProblems(s)[0]).toMatch(/1 cells have no agent/);
  });

  it("refuses a battle of another mode", () => {
    expect(() => metadataToSetup({ mode: "model" })).toThrow(/not a matrix/);
  });
});

describe("parsePastedPrompts", () => {
  it("splits lines, or blank-line blocks when present", () => {
    expect(parsePastedPrompts("a\nb\n\n c ")).toEqual(["a\nb", "c"]);
    expect(parsePastedPrompts("a\r\nb\nc")).toEqual(["a", "b", "c"]);
    expect(parsePastedPrompts("  \n ")).toEqual([]);
  });
});

describe("tool usage", () => {
  const cell = (tools: { name: string; count: number }[], status = "completed") =>
    entryToCell(
      {
        id: "e",
        comparison_set_id: "s",
        conversation_id: "c",
        display_order: 0,
        agent_id: "a",
        agent_version: null,
        agent_version_snapshot_id: null,
        created_at: "",
        metadata: { kind: "matrix_cell", row_id: "r", column_id: "k", repeat: 0, status, result: { tools_used: tools } },
      } as ComparisonEntryRow,
      Date.now(),
    )!;

  it("never counts a bundle lister as using a tool", () => {
    expect(realToolCalls(cell([{ name: "bundle:list_google", count: 2 }]).result)).toBe(0);
    expect(rowUsedTools([cell([{ name: "bundle:list_google", count: 1 }])])).toBe(false);
    expect(rowUsedTools([cell([{ name: "bundle:list_google", count: 1 }]), cell([{ name: "web", count: 1 }])])).toBe(true);
    expect(rowUsedTools([cell([], "running")])).toBeNull();
  });

  it("marks a running cell past its lease as stalled", () => {
    const row = {
      id: "e", comparison_set_id: "s", conversation_id: "c", display_order: 0, agent_id: "a",
      agent_version: null, agent_version_snapshot_id: null, created_at: "",
      metadata: { kind: "matrix_cell", status: "running", heartbeat_at: new Date(Date.now() - 120_000).toISOString() },
    } as ComparisonEntryRow;
    expect(entryToCell(row, Date.now())?.stalled).toBe(true);
  });
});

describe("breakEven", () => {
  it("finds the share where two columns cost the same", () => {
    // A: cheap without tools (1), dear with tools (5); B: 2 and 3.
    const be = breakEven({ tools: 5, none: 1 }, { tools: 3, none: 2 });
    expect(be.kind).toBe("share");
    if (be.kind === "share") {
      expect(be.p).toBeCloseTo(1 / 3);
      expect(be.cheaperBelow).toBe("a");
    }
  });

  it("says when one column is always cheaper, and when data is missing", () => {
    expect(breakEven({ tools: 1, none: 1 }, { tools: 2, none: 2 })).toEqual({ kind: "always", cheaper: "a" });
    expect(breakEven({ tools: null, none: 1 }, { tools: 2, none: 2 })).toEqual({ kind: "unknown" });
  });
});
