import type { CapturedError } from "@/lib/diagnostics/errorCaptureStore";
import {
  capturedErrorToInvestigationPrompt,
  capturedErrorsToInvestigationPrompt,
} from "@/lib/diagnostics/buildCapturedErrorPayload";

const error: CapturedError = {
  id: "captured-1",
  source: "agent-stream-error",
  firstAt: Date.parse("2026-08-11T20:24:17.327Z"),
  lastAt: Date.parse("2026-08-11T20:24:17.327Z"),
  count: 1,
  route: "/marketing/example",
  url: "https://www.aimatrx.com/marketing/example",
  operation: "unknown",
  relation: "unknown_error",
  code: "unknown_error",
  message: "An unexpected unknown error occurred. Retrying...",
  userMessage: "Failed after 3 retry attempts.",
  requestId: "8b27a610-608f-450b-a3ab-8a9439ef8743",
  tier: "red",
  raw: { error_type: "unknown_error" },
};

describe("Error Inspector investigation prompts", () => {
  it("wraps one faithful error payload in the durable-fix instructions", () => {
    const prompt = capturedErrorToInvestigationPrompt(error);

    expect(prompt).toContain("complete, evidence-based root cause analysis");
    expect(prompt).toContain("make no code changes");
    expect(prompt).toContain("Do not merely silence or downgrade the error");
    expect(prompt).toContain("<captured-error-evidence>\n<app-error");
    expect(prompt).toContain(error.requestId);
    expect(prompt).toContain("the incident is rarely only one failure");
  });

  it("preserves every supplied error inside the whole-session prompt", () => {
    const second = {
      ...error,
      id: "captured-2",
      code: "record_failed",
      message: "user_request ended in failed status (recorded)",
    };
    const prompt = capturedErrorsToInvestigationPrompt([error, second]);

    expect(prompt).toContain('<app-errors count="2" occurrences="2"');
    expect(prompt).toContain("unknown_error");
    expect(prompt).toContain("record_failed");
    expect(prompt).toContain("Inspect all of them");
  });
});
