import { finalizeGame } from "../finalizeGame";
import { gameService } from "../gameService";
import type { GameOutcome } from "../../types";

jest.mock("../gameService", () => ({
  gameService: { finalizeResult: jest.fn() },
}));

const finalizeResult = jest.mocked(gameService.finalizeResult);

const outcome: GameOutcome = {
  roomId: null,
  sessionId: "11111111-1111-4111-8111-111111111111",
  mode: "solo",
  score: 999_999,
  correctCount: 99,
  answeredCount: 99,
  bestStreak: 99,
  masteryGain: 99,
  currencyEarned: 99,
  durationMs: 1,
  sourceKind: "set",
  sourceSetId: null,
  sourceTitle: null,
};

describe("finalizeGame authority handoff", () => {
  beforeEach(() => finalizeResult.mockReset());

  it("uses only the official row and exact badges returned by its transaction", async () => {
    finalizeResult.mockResolvedValue({
      data: {
        id: "result-id",
        room_id: null,
        session_id: outcome.sessionId,
        mode: "solo",
        score: 310,
        correct_count: 2,
        answered_count: 3,
        best_streak: 1,
        mastery_gain: 2,
        currency_earned: 50,
        duration_ms: 12_000,
        source_kind: "set",
        source_set_id: null,
        source_title: null,
        metadata: { new_badges: ["first_game", "not_a_badge"] },
      } as unknown as NonNullable<
        Awaited<ReturnType<typeof gameService.finalizeResult>>["data"]
      >,
      error: null,
    });

    const result = await finalizeGame({ outcome, displayName: "Learner" });

    expect(result.error).toBeNull();
    expect(result.officialOutcome?.score).toBe(310);
    expect(result.officialOutcome?.answeredCount).toBe(3);
    expect(result.newBadges).toEqual(["first_game"]);
  });

  it("fails loudly instead of leaving a null response pending forever", async () => {
    finalizeResult.mockResolvedValue({ data: null, error: null });
    const result = await finalizeGame({ outcome, displayName: "Learner" });
    expect(result.officialOutcome).toBeNull();
    expect(result.error).toMatch(/no result/i);
  });

  it("refuses to finalize a round without a durable session", async () => {
    const result = await finalizeGame({
      outcome: { ...outcome, sessionId: null },
      displayName: "Learner",
    });
    expect(finalizeResult).not.toHaveBeenCalled();
    expect(result.error).toMatch(/study session/i);
  });
});
