/**
 * The shared spoken-grading boundary owns one bounded structured-output retry.
 * A transient malformed provider answer must resolve before any caller can
 * persist an ungraded attempt, while repeated malformed output stays loud.
 */

const runHeadlessAgentJson = jest.fn();

jest.mock(
  "@/features/agents/redux/execution-system/thunks/run-headless-agent-json",
  () => ({
    runHeadlessAgentJson: (...args: unknown[]) =>
      runHeadlessAgentJson(...args),
  }),
);

import { runSpokenGrader } from "../grading-core";

const dispatch = jest.fn();
const getState = jest.fn(() => ({}));

const grade = {
  result: "correct",
  score: 1,
  rubric: { accuracy: 1, completeness: 1, clarity: 1 },
  transcript: "Paris",
  audio_feedback: "Correct.",
  missing: [],
};

function run() {
  return runSpokenGrader({
    mandateKey: "flashcards.grade_spoken",
    front: "Capital of France?",
    back: "Paris",
    secondsAllowed: 10,
    responseAudioFileId: "file-audio-1",
    surfaceKey: "fastfire-grade-card-1",
    sourceFeature: "education-fastfire",
    surfaceName: "matrx-user/education-fastfire",
  })(dispatch as never, getState as never);
}

describe("runSpokenGrader structured-output recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("retries one malformed answer and returns the recovered grade", async () => {
    runHeadlessAgentJson
      .mockResolvedValueOnce({
        success: false,
        data: null,
        fullResponse: "I cannot format that response.",
        error: "The spoken grader finished but produced no structured grade.",
      })
      .mockResolvedValueOnce({
        success: true,
        data: grade,
        fullResponse: JSON.stringify(grade),
      });

    await expect(run()).resolves.toMatchObject({
      score: 1,
      transcript: "Paris",
    });
    expect(runHeadlessAgentJson).toHaveBeenCalledTimes(2);
    expect(runHeadlessAgentJson.mock.calls[0]?.[2]).toMatchObject({
      deferNoJsonCapture: true,
      failureMessages: {
        noJson: "The spoken grader finished but produced no structured grade.",
      },
    });
    expect(runHeadlessAgentJson.mock.calls[1]?.[2]).not.toHaveProperty(
      "deferNoJsonCapture",
    );
  });

  it("does not retry a transport failure", async () => {
    runHeadlessAgentJson.mockResolvedValueOnce({
      success: false,
      data: null,
      fullResponse: "",
      error: "The agent failed before returning a result.",
      errorDetail: "provider unavailable",
    });

    await expect(run()).resolves.toBeNull();
    expect(runHeadlessAgentJson).toHaveBeenCalledTimes(1);
  });

  it("stops after the bounded second malformed answer", async () => {
    runHeadlessAgentJson.mockResolvedValue({
      success: false,
      data: null,
      fullResponse: "not json",
      error: "The spoken grader finished but produced no structured grade.",
    });

    await expect(run()).resolves.toBeNull();
    expect(runHeadlessAgentJson).toHaveBeenCalledTimes(2);
  });
});
