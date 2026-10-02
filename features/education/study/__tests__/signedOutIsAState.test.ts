/**
 * A signed-out visitor is a STATE, not a study-service failure.
 *
 * Live 2026-10-01 (/education/progress, signed out): every study read threw
 * `requireUserId()`'s "Not authenticated", and `fail()` mirrored each one to
 * console.error as "[study] listSessions/getStreak/listAllAttempts/
 * listAllMastery: Not authenticated" (captured as errors), while
 * `learningGain.getReport` went to the network as `anon` and came back
 * "permission denied for table assessment_result".
 */

const mockListGainResults = jest.fn();
jest.mock("@/features/education/assessment/data/assessmentService", () => ({
  assessmentService: { listGainResults: () => mockListGainResults() },
}));

import { requireUserId } from "@/utils/auth/getUserId";
import { fail } from "../service/serviceError";
import { learningGainService } from "../learning-gain/learningGainService";

describe("signed out is a state, not a study failure", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockListGainResults.mockReset();
  });

  it("does not log a missing session as a service error", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    let thrown: unknown;
    try {
      requireUserId(); // no store, no user — the signed-out visitor
    } catch (e) {
      thrown = e;
    }
    const result = fail("listSessions", thrown);
    expect(consoleError).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("never sends the learning-gain read without a session", async () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockListGainResults.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied for table assessment_result", details: null, hint: null },
    });
    const result = await learningGainService.getReport();
    expect(mockListGainResults).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
  });
});
