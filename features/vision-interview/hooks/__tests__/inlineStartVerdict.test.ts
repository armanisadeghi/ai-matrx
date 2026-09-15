import {
  SILENT_START_MESSAGE,
  interpretInlineEvent,
} from "../useInterviewRun";

// WALL W9 (2026-09-15). The Vision Interview's "Finish the interview and write
// the documents" hung on "Handing the interview to the room… Working…" for
// nine minutes. The server had already crashed — `start_session_run` raised
// `vision_interview_v1 definition failed validation` BEFORE any workflow.run
// row existed — and sent its `error` envelope down the inline NDJSON stream.
// The room's handler dropped every non-`data` event, so the phase never left
// `starting`. These cases are the wire shapes the server actually sends; a
// room that cannot read them is a room that lies about working.
describe("interpretInlineEvent — the inline start/resume wire", () => {
  it("reads the run_id that arms the follower", () => {
    expect(
      interpretInlineEvent({
        event: "data",
        data: {
          event: "interview_run_started",
          run_id: "9d0f7a1e-0000-4000-8000-000000000001",
        },
      }),
    ).toEqual({
      kind: "run_started",
      runId: "9d0f7a1e-0000-4000-8000-000000000001",
    });
  });

  it("reads the workflow_run_started alias too", () => {
    expect(
      interpretInlineEvent({
        event: "data",
        data: { event: "workflow_run_started", run_id: "abc" },
      }),
    ).toEqual({ kind: "run_started", runId: "abc" });
  });

  it("FAILS the run on the server's fatal_error envelope, preferring the person-facing sentence", () => {
    const verdict = interpretInlineEvent({
      event: "error",
      data: {
        error_type: "visioninterview_error",
        message:
          "vision_interview_v1 definition failed validation: edges[e_apply_skip].data.mappings.skipped: ...",
        user_message: "VisionInterview:45ad9d00 failed. Please try again.",
      },
    });
    expect(verdict).toEqual({
      kind: "failed",
      message: "VisionInterview:45ad9d00 failed. Please try again.",
    });
  });

  it("falls back to the raw message when the server sent no person-facing one", () => {
    expect(
      interpretInlineEvent({
        event: "error",
        data: { error_type: "x", message: "boom" },
      }),
    ).toEqual({ kind: "failed", message: "boom" });
  });

  it("never reports success on an error with no text at all", () => {
    const verdict = interpretInlineEvent({ event: "error", data: {} });
    expect(verdict?.kind).toBe("failed");
    expect((verdict as { message: string }).message.length).toBeGreaterThan(20);
  });

  it("stays silent on the events that carry no verdict", () => {
    expect(interpretInlineEvent({ event: "chunk", data: { text: "hi" } })).toBeNull();
    expect(interpretInlineEvent({ event: "end", data: {} })).toBeNull();
    expect(interpretInlineEvent({ event: "data", data: { event: "other" } })).toBeNull();
    expect(interpretInlineEvent(null)).toBeNull();
  });
});

describe("a start stream that says nothing terminal", () => {
  it("has an honest sentence that names the remedy and reassures", () => {
    expect(SILENT_START_MESSAGE).toMatch(/never started/i);
    expect(SILENT_START_MESSAGE).toMatch(/try Finish again/i);
    expect(SILENT_START_MESSAGE).toMatch(/nothing you have said is lost/i);
  });
});
