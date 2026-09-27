/**
 * A WARNED CHOICE THAT ANSWERS WITHOUT A REQUIRED KEY FAILS PLAINLY — in the
 * ONE client funnel (`runHeadlessAgentJson`), exactly as the server's own run
 * path does (`mandate_output_unusable`).
 *
 * Validation offers, never blocks (aidream 1363): a chosen agent whose declared
 * output lacks keys the job expects RUNS, and the resolution names it in
 * `output_warnings`. If its answer then lacks a key, nothing may be saved —
 * but an UNWARNED holder keeps today's behaviour exactly.
 *
 * RED on the old tree: `failWarnedOutputMissingKeys` did not exist, and a
 * warned holder's half-answer resolved `success: true` into the caller's
 * persistence seam.
 */

import { failWarnedOutputMissingKeys } from "../run-headless-agent-json";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { resolveMandate } from "@/features/mandates/service";

jest.mock("@/lib/diagnostics/errorCaptureStore", () => ({
  ...jest.requireActual("@/lib/diagnostics/errorCaptureStore"),
  captureError: jest.fn(),
}));

jest.mock("@/features/mandates/service", () => ({
  resolveMandate: jest.fn(),
}));

jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectAgentName: (_state: unknown, id: string) => (id === "agent-quiz" ? "Quiz Maker" : undefined),
}));

const captureErrorMock = jest.mocked(captureError);
const resolveMock = jest.mocked(resolveMandate);

const getState = (() => ({})) as never;
const opts = { mandateKey: "flashcards.grade" as never, surfaceKey: "test/surface" };

function resolution(outputWarnings: unknown[]) {
  return {
    agentId: "agent-quiz",
    contract: { requiredVariables: [], requiredContextPolicies: [], requiredOutputKeys: ["grade", "feedback"] },
    outputWarnings,
  } as never;
}

const WARNED = [
  {
    rung: "user",
    holderType: "agent",
    holderId: "agent-quiz",
    missingKeys: ["feedback"],
    reason: "The agent chosen here does not declare the output key(s) feedback this job expects.",
  },
];

function ok(data: unknown) {
  return { success: true, data, fullResponse: "{}", requestId: "req-1", conversationId: "conv-1" };
}

describe("failWarnedOutputMissingKeys", () => {
  beforeEach(() => {
    captureErrorMock.mockClear();
    resolveMock.mockReset();
  });

  it("warned + missing key → fails plainly, saves nothing, and captures it", async () => {
    resolveMock.mockResolvedValue(resolution(WARNED));
    const result = await failWarnedOutputMissingKeys(getState, opts, ok({ grade: 3 }));
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBe(
      "Quiz Maker ran, but its answer is missing feedback this job needs, so nothing was saved. " +
        "It was chosen although it does not declare those keys — pick one that does.",
    );
    expect(result.errorDetail).toContain("mandate_output_unusable");
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
    expect(captureErrorMock.mock.calls[0][0]).toMatchObject({
      source: "agent-json-result",
      code: "mandate_output_unusable",
      requestId: "req-1",
    });
  });

  it("warned + every key present → untouched", async () => {
    resolveMock.mockResolvedValue(resolution(WARNED));
    const input = ok({ grade: 3, feedback: "Good" });
    const result = await failWarnedOutputMissingKeys(getState, opts, input);
    expect(result).toBe(input);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("warned + the key answered inside a decision artifact's `answers` → untouched", async () => {
    resolveMock.mockResolvedValue(resolution(WARNED));
    const input = ok({ grade: 3, answers: { feedback: "Good" } });
    expect(await failWarnedOutputMissingKeys(getState, opts, input)).toBe(input);
  });

  it("UNWARNED + missing key → untouched (today's behaviour)", async () => {
    resolveMock.mockResolvedValue(resolution([]));
    const input = ok({ grade: 3 });
    const result = await failWarnedOutputMissingKeys(getState, opts, input);
    expect(result).toBe(input);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("warned + a PROSE answer (no structured result) → missing EVERY required key, plainly", async () => {
    resolveMock.mockResolvedValue(resolution(WARNED));
    const prose = {
      success: false,
      data: null,
      error: "The agent finished but produced no structured JSON.",
      noResult: true,
      fullResponse: "Here is a guide to luxury shopping in NYC…",
      requestId: "req-2",
      conversationId: "conv-2",
    };
    const result = await failWarnedOutputMissingKeys(getState, opts, prose);
    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBe(
      "Quiz Maker ran, but its answer is missing grade, feedback this job needs, so nothing was saved. " +
        "It was chosen although it does not declare those keys — pick one that does.",
    );
    expect(result.errorDetail).toMatch(/^mandate_output_unusable/);
    expect(captureErrorMock).toHaveBeenCalledTimes(1);
  });

  it("warned + a non-object answer → missing every required key", async () => {
    resolveMock.mockResolvedValue(resolution(WARNED));
    const result = await failWarnedOutputMissingKeys(getState, opts, ok(["a", "b"]));
    expect(result.success).toBe(false);
    expect(result.errorDetail).toMatch(/^mandate_output_unusable/);
  });

  it("warned + a transport / launch failure → keeps its own reason", async () => {
    resolveMock.mockResolvedValue(resolution(WARNED));
    const failed = {
      success: false,
      data: null,
      error: "Google rejected the request.",
      errorDetail: "provider_error · 400",
      fullResponse: "",
    };
    expect(await failWarnedOutputMissingKeys(getState, opts, failed)).toBe(failed);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("UNWARNED + a prose answer → untouched", async () => {
    resolveMock.mockResolvedValue(resolution([]));
    const prose = { success: false, data: null, error: "no JSON", noResult: true, fullResponse: "prose" };
    expect(await failWarnedOutputMissingKeys(getState, opts, prose)).toBe(prose);
    expect(captureErrorMock).not.toHaveBeenCalled();
  });

  it("a text run is never judged", async () => {
    const input = ok("plain prose");
    expect(
      await failWarnedOutputMissingKeys(getState, { ...opts, expect: "text" }, input),
    ).toBe(input);
    expect(resolveMock).not.toHaveBeenCalled();
  });

  it("no mandate key → never reads the resolution", async () => {
    const input = ok({ grade: 3 });
    expect(await failWarnedOutputMissingKeys(getState, { surfaceKey: "x" }, input)).toBe(input);
    expect(resolveMock).not.toHaveBeenCalled();
  });
});
