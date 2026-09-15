import type { SchRunRow } from "../types";

const schedulerDbMock = jest.fn();
const requiredIds = jest.fn();
const abortSignals: AbortSignal[] = [];

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/schedulerDb", () => ({
  schedulerDb: (...args: unknown[]) => schedulerDbMock(...args),
}));

import { listRunsForTask, parseTaskMetadata } from "./queries";

function run(id: string, createdAt: string): SchRunRow {
  return {
    id,
    task_id: "task-1",
    trigger_id: null,
    user_id: "user-1",
    status: "success",
    surface: null,
    queue: null,
    output_ref: null,
    due_at: createdAt,
    claimed_at: null,
    started_at: null,
    finished_at: createdAt,
    claim_token: null,
    claim_expires_at: null,
    result_summary: null,
    error_message: null,
    result_metadata: null,
    created_at: createdAt,
  };
}

function chain(response: { data: SchRunRow[]; error: null }, trackIn = false) {
  const value: Record<string, jest.Mock> = {};
  for (const method of [
    "schema",
    "from",
    "select",
    "eq",
    "order",
    "limit",
    "abortSignal",
  ]) {
    value[method] =
      method === "abortSignal"
        ? jest.fn((signal: AbortSignal) => {
            abortSignals.push(signal);
            return value;
          })
        : jest.fn(() => value);
  }
  value.in = trackIn
    ? requiredIds.mockImplementation(() => value)
    : jest.fn(() => value);
  value.returns = jest.fn().mockResolvedValue(response);
  return value;
}

describe("schedule run history query", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    abortSignals.length = 0;
  });

  it("preserves the repeat-guard verdict at the JSON ingress boundary", () => {
    const metadata = parseTaskMetadata({
      auto_suspended_history: [
        {
          run_id: "78c5de02-545e-45b3-9ab9-85f05525c433",
          verdict: "FALSE — productive work was committed",
        },
      ],
    });

    expect(metadata.auto_suspended_history?.[0]?.verdict).toBe(
      "FALSE — productive work was committed",
    );
  });

  it("fetches exact referenced runs missing from the recent page and merges them", async () => {
    const recent = run("recent-run", "2026-09-15T15:00:00.000Z");
    const historical = run(
      "78c5de02-545e-45b3-9ab9-85f05525c433",
      "2026-08-26T04:41:17.839Z",
    );
    const responses = [
      chain({ data: [recent], error: null }),
      chain({ data: [historical], error: null }, true),
    ];
    schedulerDbMock.mockImplementation(() => responses.shift());

    const result = await listRunsForTask("task-1", 20, [historical.id]);

    expect(requiredIds).toHaveBeenCalledWith("id", [historical.id]);
    expect(result.map((item) => item.id)).toEqual([recent.id, historical.id]);
    expect(abortSignals).toHaveLength(2);
    expect(abortSignals[1]).toBe(abortSignals[0]);
  });
});
