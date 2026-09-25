const mockReadAllRows = jest.fn();
const from = jest.fn();

jest.mock("@ai-matrx/data/db", () => ({ readAllRows: mockReadAllRows }));
jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));
jest.mock("@/utils/supabase/docprocDb", () => ({
  docprocDb: () => ({ from }),
}));

import { listResults, listResultsForFile } from "./runs";

interface RecordedQuery {
  select(...args: unknown[]): RecordedQuery;
  eq(...args: unknown[]): RecordedQuery;
  order(...args: unknown[]): RecordedQuery;
  range(from: number, to: number): Promise<{ data: Array<{ id: string }>; error: null; count: number }>;
}

function row(index: number) {
  return { id: `result-${index}` };
}

function queryRecorder() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const rows = Array.from({ length: 1_001 }, (_, index) => row(index));
  const query: RecordedQuery = {
    select: (...args) => {
      calls.push({ method: "select", args });
      return query;
    },
    eq: (...args) => {
      calls.push({ method: "eq", args });
      return query;
    },
    order: (...args) => {
      calls.push({ method: "order", args });
      return query;
    },
    range: async (from, to) => {
      calls.push({ method: "range", args: [from, to] });
      return { data: rows.slice(from, to + 1), error: null, count: rows.length };
    },
  };
  return { calls, query };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReadAllRows.mockImplementation(async (readPage: (range: { from: number; to: number }) => Promise<{ data: Array<{ id: string }> | null; count: number }>) => {
    const all: Array<{ id: string }> = [];
    for (let fromIndex = 0; ; fromIndex += 1_000) {
      const page = await readPage({ from: fromIndex, to: fromIndex + 999 });
      all.push(...(page.data ?? []));
      if (all.length >= page.count) return all;
    }
  });
});

describe("complete extraction result reads", () => {
  it("pages a run-filtered dataset past 1,000 rows with exact count and stable order", async () => {
    const recorders = [queryRecorder(), queryRecorder()];
    let nextQuery = 0;
    from.mockImplementation(() => recorders[nextQuery++]?.query);

    const rows = await listResults({ jobId: "job-1", runId: "run-1" });

    expect(rows).toHaveLength(1_001);
    expect(rows.at(-1)?.id).toBe("result-1000");
    expect(mockReadAllRows).toHaveBeenCalledTimes(1);
    expect(recorders.map(({ calls }) => calls)).toEqual([
      [
        { method: "select", args: ["*", { count: "exact" }] },
        { method: "eq", args: ["job_id", "job-1"] },
        { method: "eq", args: ["run_id", "run-1"] },
        { method: "order", args: ["canonical_page", { ascending: true, nullsFirst: false }] },
        { method: "order", args: ["created_at", { ascending: true }] },
        { method: "order", args: ["id", { ascending: true }] },
        { method: "range", args: [0, 999] },
      ],
      [
        { method: "select", args: ["*", { count: "exact" }] },
        { method: "eq", args: ["job_id", "job-1"] },
        { method: "eq", args: ["run_id", "run-1"] },
        { method: "order", args: ["canonical_page", { ascending: true, nullsFirst: false }] },
        { method: "order", args: ["created_at", { ascending: true }] },
        { method: "order", args: ["id", { ascending: true }] },
        { method: "range", args: [1000, 1999] },
      ],
    ]);
  });

  it("keeps the file predicate when reading every file result", async () => {
    const recorders = [queryRecorder(), queryRecorder()];
    let nextQuery = 0;
    from.mockImplementation(() => recorders[nextQuery++]?.query);

    const rows = await listResultsForFile("file-1");

    expect(rows).toHaveLength(1_001);
    expect(mockReadAllRows).toHaveBeenCalledTimes(1);
    expect(recorders.map(({ calls }) => calls)).toEqual([
      [
        { method: "select", args: ["*", { count: "exact" }] },
        { method: "eq", args: ["file_id", "file-1"] },
        { method: "order", args: ["canonical_page", { ascending: true, nullsFirst: false }] },
        { method: "order", args: ["created_at", { ascending: true }] },
        { method: "order", args: ["id", { ascending: true }] },
        { method: "range", args: [0, 999] },
      ],
      [
        { method: "select", args: ["*", { count: "exact" }] },
        { method: "eq", args: ["file_id", "file-1"] },
        { method: "order", args: ["canonical_page", { ascending: true, nullsFirst: false }] },
        { method: "order", args: ["created_at", { ascending: true }] },
        { method: "order", args: ["id", { ascending: true }] },
        { method: "range", args: [1000, 1999] },
      ],
    ]);
  });
});
