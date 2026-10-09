import {
  drillAnswerLocally,
  drillConfigFromColumns,
  drillDroppedItems,
  drillLevelProblems,
  emptyDrillQuestion,
} from "@ai-matrx/design-system/data-table";
import type { CodexUsageRow } from "@/features/admin/codex-usage/service";
import { CODEX_COLUMNS, CODEX_DRILL, toCodexCells } from "../codexDrill";

const cell = (o: Partial<CodexUsageRow>): CodexUsageRow => ({
  conversation_id: "c1",
  conversation_title: "Fix the sync",
  root_id: "c1",
  project: "matrx-frontend",
  model: "gpt-5",
  effort: "high",
  response_count: 2,
  input_tokens: 100,
  output_tokens: 10,
  total_tokens: 110,
  estimated_standard_credits: 1.5,
  ...o,
});

const cells: CodexUsageRow[] = [
  cell({}),
  cell({ conversation_id: "c2", conversation_title: "Review", root_id: "c2", model: "gpt-5-mini", effort: "low", response_count: 3, estimated_standard_credits: null }),
  cell({ conversation_id: "w1", conversation_title: "Worker one", root_id: "c1", project: "aidream", response_count: 1, estimated_standard_credits: 0.5 }),
  // No responses and no price: not "unknown", just nothing.
  cell({ conversation_id: "c3", conversation_title: "Idle", root_id: "c3", response_count: 0, estimated_standard_credits: null, total_tokens: 0 }),
];

describe("codex usage drill", () => {
  const rows = toCodexCells(cells);
  const config = drillConfigFromColumns(CODEX_COLUMNS, rows, CODEX_DRILL);

  it("declares only levels its Dimensions and Measures honour", () => {
    expect(drillLevelProblems(config.dimensions, config.measures, { attributeKeys: config.fields?.map((f) => f.key) })).toEqual([]);
  });

  it("drops nothing it was asked to offer", () => {
    expect(drillDroppedItems(config.dimensions, CODEX_DRILL)).toEqual([]);
  });

  it("a model's groups are the model rollup, with the unknown credits said", () => {
    const q = { ...emptyDrillQuestion(["sum_responses", "sum_credits"]), by: ["model"] };
    const groups = (drillAnswerLocally(rows, q, config).model ?? []) as unknown as {
      groups: { model: string };
      measures: Record<string, number | null>;
      unknown?: Record<string, number>;
    }[];
    const mini = groups.find((g) => g.groups.model === "gpt-5-mini");
    expect(mini?.measures.sum_responses).toBe(3);
    expect(mini?.measures.sum_credits ?? 0).toBe(0);
    expect(mini?.unknown?.sum_credits).toBe(1);
    const five = groups.find((g) => g.groups.model === "gpt-5");
    expect(five?.measures.sum_credits).toBeCloseTo(2.0, 6);
    expect(five?.unknown?.sum_credits ?? 0).toBe(0);
  });

  it("marks a worker by its root", () => {
    expect(rows.find((r) => r.conversationId === "w1")?.kind).toBe("Worker");
    expect(rows.find((r) => r.conversationId === "c1")?.kind).toBe("Conversation");
  });
});
