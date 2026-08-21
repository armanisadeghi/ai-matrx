/**
 * This decision runs inside `process-stream` — the hot path every chat message
 * flows through — so what it must NOT do matters as much as what it must: never
 * fire for another tool, never fire on a start/error, never invent an id.
 */

import { readHumanRequiredSignal } from "./streamHandoffSignal";

const HUMAN_REQUIRED = {
  status: "human_required",
  reason: "mfa_required",
  message: "Approve the sign-in on your phone.",
  session_id: "run-42",
  success: true,
};

describe("readHumanRequiredSignal", () => {
  it("reads the run id from a cloud_browser tool result", () => {
    expect(
      readHumanRequiredSignal(
        "tool_completed",
        "cloud_browser_navigate",
        HUMAN_REQUIRED,
      ),
    ).toEqual({ runId: "run-42", handoffId: null });
  });

  it("reads the handoff id from credential_login, which sends no run id", () => {
    expect(
      readHumanRequiredSignal("tool_completed", "credential_login", {
        status: "human_required",
        reason: "capture_card_open",
        handoff_id: "hoff-7",
      }),
    ).toEqual({ runId: null, handoffId: "hoff-7" });
  });

  it("ignores a browser result that did NOT stop for a person", () => {
    expect(
      readHumanRequiredSignal("tool_completed", "cloud_browser_navigate", {
        status: "ok",
        session_id: "run-42",
      }),
    ).toBeNull();
  });

  it("ignores every other tool, however its result is shaped", () => {
    expect(
      readHumanRequiredSignal("tool_completed", "web_search", HUMAN_REQUIRED),
    ).toBeNull();
  });

  it("ignores non-completion events for the same tool", () => {
    for (const event of ["tool_started", "tool_error", "tool_progress"]) {
      expect(
        readHumanRequiredSignal(event, "cloud_browser_navigate", HUMAN_REQUIRED),
      ).toBeNull();
    }
  });

  it("never invents an id when the payload names neither", () => {
    expect(
      readHumanRequiredSignal("tool_completed", "cloud_browser_navigate", {
        status: "human_required",
        reason: "captcha_required",
      }),
    ).toBeNull();
  });

  it("survives a malformed or missing result instead of throwing", () => {
    for (const result of [undefined, null, "human_required", 7, []]) {
      expect(
        readHumanRequiredSignal(
          "tool_completed",
          "cloud_browser_navigate",
          result,
        ),
      ).toBeNull();
    }
  });
});
