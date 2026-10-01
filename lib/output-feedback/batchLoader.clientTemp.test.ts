/**
 * `platform.output_feedback.subject_id` is a uuid. A subject id that is not a
 * durable record id (a client-temp chat answer such as
 * `client-assistant-req_…`) must never reach the batched `in (...)` read —
 * one such id 400s the WHOLE chunk (22P02), blanking every real thumb beside
 * it. Break caught: the loader queueing every id it is handed.
 */

const fetchOutputFeedbackForSubjects = jest.fn(
  async (_subjectType: string, _ids: string[]) => [],
);

jest.mock("./service", () => ({
  fetchOutputFeedbackForSubjects: (subjectType: string, ids: string[]) =>
    fetchOutputFeedbackForSubjects(subjectType, ids),
}));

import { loadOutputFeedback } from "./batchLoader";
import { peekOutputFeedback } from "./store";

async function flushBatchWindow(): Promise<void> {
  // The loader's coalescing window is part of the behavior under test (one
  // query per tick), so this waits it out on fake timers, then lets the
  // async flush settle.
  jest.advanceTimersByTime(50);
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  jest.useFakeTimers();
  fetchOutputFeedbackForSubjects.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("output-feedback batch loader", () => {
  it.each([
    [
      "client-assistant-req_e61282d2-70ce-45f9-bac3-ebbd3f78d7e1",
      "0d3372ab-2b54-4f67-b786-20b3cdec9f39",
    ],
    [
      "client-assistant-req_4f0b9c1e-2d3a-4c5b-9e8f-7a6b5c4d3e2f-iter3",
      "491c0e73-1610-4f94-af65-598bb26c3e89",
    ],
  ])(
    "queries only the durable id when %s sits beside %s",
    async (clientTempId, durableId) => {
      loadOutputFeedback("message", clientTempId);
      loadOutputFeedback("message", durableId);
      await flushBatchWindow();

      const queried = fetchOutputFeedbackForSubjects.mock.calls.flatMap(
        ([, ids]) => ids,
      );
      expect(queried).toEqual([durableId]);
      // The client-temp subject stays unanswered — not a fabricated "no
      // verdict" — so it loads normally once its durable id renders.
      expect(
        peekOutputFeedback({ subjectType: "message", subjectId: clientTempId }),
      ).toBeUndefined();
    },
  );
});
