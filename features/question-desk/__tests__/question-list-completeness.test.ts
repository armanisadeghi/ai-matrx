// The complete interview read must cross PostgREST's 1,000-row response cap.
// A single .limit(2001) still returns a successful-looking first 1,000 rows.

import type { DecisionQuestionRow } from "../types";

const ranges: Array<{ from: number; to: number }> = [];
const orders: string[] = [];

jest.mock("@ai-matrx/data/db", () => ({
  guardedUpdate: jest.fn(),
  readAllRows: async <T>(
    query: (range: { from: number; to: number }) => Promise<{
      data: T[];
      error: null;
      count: number;
    }>,
  ) => {
    const first = await query({ from: 0, to: 999 });
    const second = await query({ from: 1000, to: 1999 });
    return [...first.data, ...second.data];
  },
}));

jest.mock("../data/db", () => ({
  db: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "order"]) {
        chain[method] = (...args: unknown[]) => {
          if (method === "order") orders.push(String(args[0]));
          return chain;
        };
      }
      chain.range = (from: number, to: number) => {
        ranges.push({ from, to });
        const rows = Array.from(
          { length: from === 0 ? 1000 : 1 },
          (_, offset) =>
            ({
              id: "question-" + String(from + offset),
              position: from + offset,
              created_at:
                "2026-09-22T00:00:" +
                String((from + offset) % 60).padStart(2, "0") +
                "Z",
            }) as DecisionQuestionRow,
        );
        return Promise.resolve({ data: rows, error: null, count: 1001 });
      };
      return chain;
    },
  }),
}));

jest.mock("../data/interviews", () => ({
  QuestionDeskReadError: class extends Error {},
}));

import { listQuestions } from "../data/questions";

describe("Question Desk complete question reads", () => {
  beforeEach(() => {
    ranges.length = 0;
    orders.length = 0;
  });

  it("pages through row 1,000 while preserving the desk filing order", async () => {
    const result = await listQuestions("interview-1");

    expect(result.questions).toHaveLength(1001);
    expect(result.questions[1000]?.id).toBe("question-1000");
    expect(ranges).toEqual([
      { from: 0, to: 999 },
      { from: 1000, to: 1999 },
    ]);
    expect(orders).toEqual([
      "position",
      "created_at",
      "id",
      "position",
      "created_at",
      "id",
    ]);
  });
});
