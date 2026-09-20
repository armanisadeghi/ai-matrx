/**
 * The admin transcript integrity report names the known "user message doesn't
 * show" signatures outright, so a pasted report reads in seconds.
 */

import {
  buildTranscriptIntegrityReport,
  formatTranscriptIntegrityReport,
} from "../transcript-integrity-report";
import type { MessageRecord } from "@/features/agents/redux/execution-system/messages/messages.slice";
import type { RootState } from "@/lib/redux/store";
import { clearTranscriptJournal } from "@/features/agents/redux/execution-system/messages/transcript-journal";

const CONV = "conv-report";

function row(
  id: string,
  role: MessageRecord["role"],
  position: number,
  patch: Partial<MessageRecord> = {},
): MessageRecord {
  return {
    id,
    conversationId: CONV,
    agentId: null,
    role,
    content: [{ type: "text", text: `${role} ${position}` }],
    contentHistory: null,
    userContent: null,
    position,
    source: "user",
    status: "active",
    isVisibleToModel: true,
    isVisibleToUser: true,
    metadata: {},
    createdAt: "2026-09-18T10:00:00.000Z",
    deletedAt: null,
    ...patch,
  };
}

function stateWith(
  records: MessageRecord[],
  entryPatch: Partial<{
    oldestPosition: number | null;
    hasMoreOlder: boolean;
    visibleGroupLimit: number | null;
  }> = {},
  request?: { status: string; startedAt: string; completedAt: string | null },
): RootState {
  const byId: Record<string, MessageRecord> = {};
  for (const r of records) byId[r.id] = r;
  const state = {
    messages: {
      byConversationId: {
        [CONV]: {
          conversationId: CONV,
          apiEndpointMode: "agent",
          byId,
          orderedIds: records.map((r) => r.id),
          title: null,
          description: null,
          keywords: null,
          oldestPosition: null,
          hasMoreOlder: false,
          isLoadingOlder: false,
          visibleGroupLimit: null,
          hydrationFailure: null,
          ...entryPatch,
        },
      },
    },
    conversations: {
      byConversationId: {
        [CONV]: { status: request ? "ready" : "ready" },
      },
    },
    activeRequests: {
      byRequestId: request
        ? {
            "req-1": {
              conversationId: CONV,
              status: request.status,
              error: null,
              timeline: [],
              startedAt: request.startedAt,
              completedAt: request.completedAt,
            },
          }
        : {},
      byConversationId: request ? { [CONV]: ["req-1"] } : {},
    },
  };
  return state as unknown as RootState;
}

const ARGS = {
  conversationId: CONV,
  surfaceKey: "agent-runner:x",
  pathname: "/agents/x/run",
  effectiveVisibleGroupLimit: null,
  now: new Date("2026-09-18T10:05:00.000Z"),
};

beforeEach(() => clearTranscriptJournal());

test("a healthy two-turn transcript reports no anomalies", () => {
  const report = buildTranscriptIntegrityReport(
    stateWith(
      [row("u0", "user", 0), row("a1", "assistant", 1)],
      { oldestPosition: 0 },
      {
        status: "complete",
        startedAt: "2026-09-18T10:00:00.000Z",
        completedAt: "2026-09-18T10:00:10.000Z",
      },
    ),
    ARGS,
  );
  expect(report.anomalies).toEqual([]);
  expect(report.rows.map((r) => r.role)).toEqual(["user", "assistant"]);
  expect(report.groups.map((g) => [g.kind, g.rendered])).toEqual([
    ["user", true],
    ["assistant", true],
  ]);
  expect(formatTranscriptIntegrityReport(report)).toContain(
    "anomalies: none detected",
  );
});

test("names a pending user row that sorted above the loaded window", () => {
  const report = buildTranscriptIntegrityReport(
    stateWith(
      [
        row("temp", "user", 12, { source: "client", _clientStatus: "pending" }),
        row("m28", "user", 28),
        row("m29", "assistant", 29),
      ],
      { oldestPosition: 28, hasMoreOlder: true },
    ),
    ARGS,
  );
  expect(report.anomalies.join("\n")).toMatch(
    /position 12, below the oldest loaded position 28/,
  );
});

test("names an optimistic row the server never acknowledged", () => {
  const report = buildTranscriptIntegrityReport(
    stateWith(
      [
        row("temp", "user", 0, { source: "client", _clientStatus: "pending" }),
        row("a1", "assistant", 1),
      ],
      {},
      {
        status: "complete",
        startedAt: "2026-09-18T10:00:00.000Z",
        completedAt: "2026-09-18T10:00:10.000Z",
      },
    ),
    ARGS,
  );
  expect(report.anomalies.join("\n")).toMatch(/never acknowledged/);
});

test("names a pending row the instant its request completes, even if it isn't stale yet", () => {
  // Regression guard for the `requestSettled` branch: it compared
  // `activeRequest.status` against the string "completed", but the real
  // RequestStatus enum only ever produces "complete" — so this branch never
  // fired and a freshly-completed request with an un-promoted pending row
  // stayed silent until the unrelated staleness timer caught up 20s later.
  const report = buildTranscriptIntegrityReport(
    stateWith(
      [
        // Created 1s before "now" — well under the 20s staleness window, so
        // only the requestSettled branch (not the age fallback) can explain
        // an anomaly here.
        row("temp", "user", 0, {
          source: "client",
          _clientStatus: "pending",
          createdAt: "2026-09-18T10:04:59.000Z",
        }),
        row("a1", "assistant", 1),
      ],
      {},
      {
        status: "complete",
        startedAt: "2026-09-18T10:00:00.000Z",
        completedAt: "2026-09-18T10:04:59.000Z",
      },
    ),
    ARGS,
  );
  expect(report.anomalies.join("\n")).toMatch(/never acknowledged/);
});

test("names a user group hidden by the visibility window", () => {
  const report = buildTranscriptIntegrityReport(
    stateWith([
      row("u0", "user", 0),
      row("a1", "assistant", 1, { error: { type: "x", message: "boom" } }),
      row("a2", "assistant", 2),
    ]),
    { ...ARGS, effectiveVisibleGroupLimit: 2 },
  );
  expect(report.groups.map((g) => [g.kind, g.rendered])).toEqual([
    ["user", false],
    ["assistant-failed", true],
    ["assistant", true],
  ]);
  expect(report.anomalies.join("\n")).toMatch(/hidden by the visible-group window/);
});

test("names a user row with nothing displayable that no host authored", () => {
  const report = buildTranscriptIntegrityReport(
    stateWith([
      row("u0", "user", 0, { userContent: [] }),
      row("a1", "assistant", 1),
    ]),
    ARGS,
  );
  expect(report.rows[0].userContentShape).toBe("empty");
  expect(report.rows[0].displayable).toBe(false);
  expect(report.anomalies.join("\n")).toMatch(/nothing displayable/);

  // The same shape stamped by the host is by design and stays quiet.
  const quiet = buildTranscriptIntegrityReport(
    stateWith([
      row("u0", "user", 0, {
        userContent: [],
        metadata: { authored_by: "host" },
      }),
      row("a1", "assistant", 1),
    ]),
    ARGS,
  );
  expect(quiet.anomalies).toEqual([]);
});

test("never includes a message body — previews are capped", () => {
  const long = "x".repeat(500);
  const report = buildTranscriptIntegrityReport(
    stateWith([row("u0", "user", 0, { content: [{ type: "text", text: long }] })]),
    ARGS,
  );
  expect(report.rows[0].textLength).toBe(500);
  expect(report.rows[0].preview.length).toBeLessThanOrEqual(81);
  expect(formatTranscriptIntegrityReport(report)).not.toContain(long);
});
