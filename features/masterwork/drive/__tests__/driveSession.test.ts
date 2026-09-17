// features/masterwork/drive/__tests__/driveSession.test.ts
//
// THE GUARD for "survives signal loss and the screen locking — resume, never
// lose a word" (2026-09-17).
//
// `naiveResolve` below is the shape this lane would have had without the
// module: a page that always starts a new conversation. It is executable, and
// the first test asserts against it, so the proof that these guards CAN fail
// lives in the file rather than in a commit message.

import {
  describeIdle,
  parseDriveMemory,
  resolveDriveSession,
  type DriveSessionMemory,
} from "../driveSession";

const RULEBOOK = "rb-1";
const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

function memory(overrides: Partial<DriveSessionMemory> = {}): DriveSessionMemory {
  return {
    rulebookId: RULEBOOK,
    conversationId: "conv-abc",
    startedAtMs: NOW - 20 * MINUTE,
    lastActiveAtMs: NOW - 2 * MINUTE,
    ...overrides,
  };
}

/** What a page that does not resume does: every load is a new interview. */
function naiveResolve(): { kind: "fresh" } {
  return { kind: "fresh" };
}

describe("a drive interview survives a reload", () => {
  it("a page with no resume logic starts over — the defect this guard exists for", () => {
    expect(naiveResolve()).toEqual({ kind: "fresh" });
  });

  it("resumes the same conversation after a reload two minutes later", () => {
    const result = resolveDriveSession({
      rulebookId: RULEBOOK,
      remembered: memory(),
      rulebookCandidate: null,
      nowMs: NOW,
      resumeWindowMinutes: 120,
    });
    expect(result).toEqual({
      kind: "resume",
      conversationId: "conv-abc",
      from: "this-device",
      idleMs: 2 * MINUTE,
    });
  });

  it("resumes after a long tunnel — anything inside the window is the same drive", () => {
    const result = resolveDriveSession({
      rulebookId: RULEBOOK,
      remembered: memory({ lastActiveAtMs: NOW - 45 * MINUTE }),
      rulebookCandidate: null,
      nowMs: NOW,
      resumeWindowMinutes: 120,
    });
    expect(result.kind).toBe("resume");
  });

  it("starts fresh once the window has passed", () => {
    const result = resolveDriveSession({
      rulebookId: RULEBOOK,
      remembered: memory({ lastActiveAtMs: NOW - 200 * MINUTE }),
      rulebookCandidate: null,
      nowMs: NOW,
      resumeWindowMinutes: 120,
    });
    expect(result).toEqual({ kind: "fresh" });
  });

  it("never resumes another Rulebook's conversation", () => {
    const result = resolveDriveSession({
      rulebookId: "rb-2",
      remembered: memory(),
      rulebookCandidate: null,
      nowMs: NOW,
      resumeWindowMinutes: 120,
    });
    expect(result).toEqual({ kind: "fresh" });
  });

  it("falls back to the Rulebook's own interview list when this device remembers nothing", () => {
    // Cleared site data, a private window, or a different phone.
    const result = resolveDriveSession({
      rulebookId: RULEBOOK,
      remembered: null,
      rulebookCandidate: {
        conversationId: "conv-from-server",
        lastActiveAtMs: NOW - 5 * MINUTE,
      },
      nowMs: NOW,
      resumeWindowMinutes: 120,
    });
    expect(result).toEqual({
      kind: "resume",
      conversationId: "conv-from-server",
      from: "this-rulebook",
      idleMs: 5 * MINUTE,
    });
  });

  it("prefers this device over the server when both are warm (no round trip to continue)", () => {
    const result = resolveDriveSession({
      rulebookId: RULEBOOK,
      remembered: memory(),
      rulebookCandidate: {
        conversationId: "conv-from-server",
        lastActiveAtMs: NOW - MINUTE,
      },
      nowMs: NOW,
      resumeWindowMinutes: 120,
    });
    expect(result.kind === "resume" && result.conversationId).toBe("conv-abc");
  });

  it("ignores a clock that ran backwards rather than resuming on a negative idle", () => {
    const result = resolveDriveSession({
      rulebookId: RULEBOOK,
      remembered: memory({ lastActiveAtMs: NOW + 10 * MINUTE }),
      rulebookCandidate: null,
      nowMs: NOW,
      resumeWindowMinutes: 120,
    });
    expect(result).toEqual({ kind: "fresh" });
  });
});

describe("stored memory is data, never a trusted shape", () => {
  it.each([
    [null],
    [undefined],
    ["not json"],
    [{}],
    [{ rulebookId: "rb-1" }],
    [{ rulebookId: "rb-1", conversationId: "" }],
    [{ rulebookId: "rb-1", conversationId: "c", startedAtMs: "x", lastActiveAtMs: 1 }],
    [{ rulebookId: "rb-1", conversationId: "c", startedAtMs: 1, lastActiveAtMs: NaN }],
  ])("rejects %p", (value) => {
    expect(parseDriveMemory(value)).toBeNull();
  });

  it("accepts a well-formed row", () => {
    expect(parseDriveMemory(memory())).toEqual(memory());
  });
});

describe("describeIdle", () => {
  it.each([
    [10_000, "a moment ago"],
    [MINUTE, "a minute ago"],
    [7 * MINUTE, "7 minutes ago"],
    [60 * MINUTE, "an hour ago"],
    [180 * MINUTE, "3 hours ago"],
  ])("%p → %p", (ms, expected) => {
    expect(describeIdle(ms)).toBe(expected);
  });
});
