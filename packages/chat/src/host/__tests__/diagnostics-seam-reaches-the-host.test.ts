/**
 * Every package failure reaches the host's diagnostics port (P5).
 *
 * Breaks guarded: the seam files to a store the host never sees; a capture
 * made before the host is configured is lost; a host sink that throws takes
 * the caller down; a host without a structured sink loses the entry.
 */
import {
  _resetChatHostForTests,
  configureChat,
} from "../configure";
import type { ChatDiagnosticContext, ChatDiagnosticEntry } from "../contract";
import {
  _resetDiagnosticsForTests,
  captureError,
  captureStreamClientError,
  netRequests,
} from "../diagnostics";
import { _resetAnnouncements } from "../errors";
import { createFakeDb } from "./fake-db";

const WARNING: ChatDiagnosticEntry = {
  source: "agent-stream-warning",
  code: "provider_slow",
  message: "The provider took 41s to answer the first token",
  conversationId: "c4a1e0b2-77d3-4f5e-9a10-3b2c8d6e1f47",
};

beforeEach(() => {
  _resetChatHostForTests();
  _resetDiagnosticsForTests();
  _resetAnnouncements();
  jest.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => _resetChatHostForTests());

it("hands a structured entry to the host's record and returns the host's id", () => {
  const recorded: ChatDiagnosticEntry[] = [];
  configureChat({
    db: createFakeDb().db,
    diagnostics: { capture() {}, record: (e) => (recorded.push(e), "inspector-row-9") },
  });
  expect(captureError(WARNING)).toBe("inspector-row-9");
  expect(recorded).toEqual([WARNING]);
});

it("falls back to capture(area = source) for a host with no structured sink", () => {
  const captured: [unknown, ChatDiagnosticContext][] = [];
  configureChat({
    db: createFakeDb().db,
    diagnostics: { capture: (error, ctx) => captured.push([error, ctx]) },
  });
  captureError(WARNING);
  captureError({ ...WARNING, durable: false, message: "handled on screen" });
  expect(captured).toHaveLength(1);
  const [error, ctx] = captured[0]!;
  expect((error as Error).message).toBe(WARNING.message);
  expect(ctx).toEqual({ area: "agent-stream-warning", code: "provider_slow", detail: WARNING });
});

it("holds what was recorded before a host existed, says so once, and delivers it on configure", () => {
  captureError(WARNING);
  captureError({ ...WARNING, message: "second" });
  expect(console.warn).toHaveBeenCalledTimes(1);
  const recorded: ChatDiagnosticEntry[] = [];
  configureChat({
    db: createFakeDb().db,
    diagnostics: { capture() {}, record: (e) => (recorded.push(e), "id") },
  });
  expect(recorded.map((e) => e.message)).toEqual([WARNING.message, "second"]);
});

it("never breaks the caller when the host's sink throws", () => {
  configureChat({
    db: createFakeDb().db,
    diagnostics: {
      capture() {
        throw new Error("sink down");
      },
      record() {
        throw new Error("sink down");
      },
      requests: {
        start() {
          throw new Error("sink down");
        },
        phase() {},
        heartbeat() {},
        finish() {},
      },
    },
  });
  expect(() => captureError(WARNING)).not.toThrow();
  expect(() =>
    netRequests.start({ id: "r1", kind: "agent-run", label: "Manual: a1" }),
  ).not.toThrow();
});

it("skips a stream death the host's transport already recorded", () => {
  const recorded: ChatDiagnosticEntry[] = [];
  const seen = new Error("heartbeat lost");
  configureChat({
    db: createFakeDb().db,
    diagnostics: {
      capture() {},
      record: (e) => (recorded.push(e), "id"),
      wasCaptured: (error) => error === seen,
    },
  });
  captureStreamClientError({ errorType: "heartbeat-timeout", message: "lost", cause: seen });
  captureStreamClientError({ errorType: "total-timeout", message: "timed out", cause: new Error("x") });
  expect(recorded.map((e) => [e.source, e.code])).toEqual([
    ["agent-stream-client-error", "total-timeout"],
  ]);
});

it("reports network work to the host's connection-health view", () => {
  const calls: unknown[] = [];
  configureChat({
    db: createFakeDb().db,
    diagnostics: {
      capture() {},
      requests: {
        start: (r) => calls.push(["start", r]),
        phase: (id, p) => calls.push(["phase", id, p]),
        heartbeat: (id) => calls.push(["beat", id]),
        finish: (r) => calls.push(["finish", r]),
      },
    },
  });
  netRequests.start({ id: "r1", kind: "agent-run", label: "Manual: a1", groupKey: "c1" });
  netRequests.phase("r1", "streaming");
  netRequests.heartbeat("r1");
  netRequests.finish({ id: "r1", phase: "completed" });
  expect(calls.map((c) => (c as unknown[])[0])).toEqual(["start", "phase", "beat", "finish"]);
});
