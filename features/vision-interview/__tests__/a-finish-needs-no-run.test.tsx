/**
 * A FINISH NEEDS NO RUN, AND A FRESH SESSION IS THE CASE THAT PROVES IT.
 *
 * 🚨 THE DEFECT, found a THIRD time by the fourth cold walk of the Masterwork
 * pipeline (2026-09-16), on a brand-new session, against the very commits the
 * walk-3 fix round certified:
 *
 *   After 2 real turns, clicked "Finish the interview and write the
 *   documents" -> confirmed -> the room advanced from Round 1 to Round 2 and
 *   its open questions grew from 9 to 15. Pressed it again -> Round 3, still
 *   no Requirements document. Reproduced here on 2026-09-16 against a session
 *   created minutes earlier: ONE press took it from Round 2 to Round 3, open
 *   questions 6 -> 11, `stage` still `capture`, `finalized_at` NULL and all
 *   three document columns NULL.
 *
 * WHY THE WALK-3 GUARD DID NOT CATCH IT. That guard
 * (`a-finish-click-finishes.test.tsx`) mounts the DIALOG with a mocked
 * `onFinish` and asserts the dialog calls it once. It can only ever prove
 * that the dialog presses the button it was given. The defect was inside the
 * button: `useInterviewRun.finish` branched on the run phase — send `done`
 * when a run was already parked on a human turn, otherwise START a run and
 * send `done` when it hands back. A run's first act, by construction, is a
 * complete interview round. The walk-3 verification was done against a
 * session that was already parked, which is the ONE branch that never runs a
 * round, so it could not fail. Every fresh v3 room has no run at all (the
 * person's turns go through `POST /observe`), so every fresh room took the
 * other branch.
 *
 * WHAT THIS PINS — and it is deliberately the thing the old guard could not
 * see: what `useInterviewRun.finish` ACTUALLY SENDS.
 *
 *  1. In EVERY phase, including `idle` with no run and no interrupt — a
 *     brand-new session — `finish()` issues exactly ONE request, and it is
 *     `POST /vision-interview/sessions/{session_id}/finish`.
 *  2. It NEVER touches `/vision-interview/sessions/{session_id}/start` and
 *     never resumes a run. Starting a run IS the extra round.
 *
 * RED against the pre-fix hook: in `idle`, `complete` and `error` it called
 * `/start`; in `waiting_human` it called `/runs/{run_id}/resume`. Not one of
 * the six phases called a finish endpoint, because there was not one.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

type RunPhase =
  | "idle"
  | "starting"
  | "running"
  | "waiting_human"
  | "complete"
  | "error";

const room: {
  runPhase: RunPhase;
  runId: string | null;
  checkpointId: string | null;
} = { runPhase: "idle", runId: null, checkpointId: null };

/** Every path `callApi` was asked for, in order. THE ASSERTION SUBJECT. */
const calls: { path: string; method: string }[] = [];

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (action: unknown) =>
    typeof action === "function" ? (action as () => unknown)() : action,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

jest.mock("../redux/vision-interview.slice", () => ({
  nodeCompleted: () => ({ type: "nodeCompleted" }),
  nodeStarted: () => ({ type: "nodeStarted" }),
  runCompleted: () => ({ type: "runCompleted" }),
  runFailed: () => ({ type: "runFailed" }),
  runInterrupted: () => ({ type: "runInterrupted" }),
  runResumed: () => ({ type: "runResumed" }),
  runStarted: () => ({ type: "runStarted" }),
  runStarting: () => ({ type: "runStarting" }),
  sessionMerged: () => ({ type: "sessionMerged" }),
  streamAdopted: () => ({ type: "streamAdopted" }),
  selectPendingInterrupt: () =>
    room.checkpointId ? { checkpointId: room.checkpointId, prompt: null } : null,
  selectRoomHydrated: () => true,
  selectRoomSession: () => ({ id: "session-1", run_id: room.runId }),
  selectRunId: () => room.runId,
  selectRunPhase: () => room.runPhase,
}));

jest.mock("@/lib/api/call-api", () => ({
  callApi: (options: { path: string; method: string; consumeStream?: unknown }) => {
    calls.push({ path: options.path, method: options.method });
    // The real thunk consumes the stream; hand the hook the one terminal
    // event a finish sends, so it settles instead of reporting silence.
    const consume = options.consumeStream as
      | ((event: unknown) => void)
      | undefined;
    consume?.({
      event: "data",
      data: { event: "interview_finished", written: ["vision_document"], failed: {} },
    });
    return () => ({});
  },
}));

jest.mock(
  "@/features/agents/redux/execution-system/thunks/adopt-foreign-stream",
  () => ({
    adoptForeignStream: ({
      onAdopted,
      onEvent,
    }: {
      onAdopted: (ids: { requestId: string; conversationId: string }) => void;
      onEvent: (event: unknown) => void;
    }) => {
      onAdopted({ requestId: "req-1", conversationId: "conv-1" });
      return (event: unknown) => onEvent(event);
    },
  }),
);

jest.mock(
  "@/features/agents/redux/execution-system/active-requests/active-requests.slice",
  () => ({ createRequest: () => ({ type: "createRequest" }) }),
);
jest.mock("@/features/agents/redux/execution-system/utils/ids", () => ({
  generateConversationId: () => "conv-1",
  generateRequestId: () => "req-1",
}));
jest.mock(
  "@/features/agents/redux/execution-system/thunks/follow-workflow-run-stream",
  () => ({ followWorkflowRunStream: () => Promise.resolve() }),
);
jest.mock("@ai-matrx/data/net", () => ({ isTransportFailure: () => false }));
jest.mock("@/lib/toast", () => ({
  toast: { error: () => undefined, info: () => undefined, success: () => undefined },
  toastErrorAlreadyCaptured: () => undefined,
}));

import { useInterviewRun } from "../hooks/useInterviewRun";

let container: HTMLDivElement;
let root: Root;
let finishFn: (() => Promise<boolean>) | null = null;

function Harness() {
  const { finish } = useInterviewRun("session-1");
  finishFn = finish;
  return <div />;
}

function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<Harness />);
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  calls.length = 0;
  finishFn = null;
  room.runPhase = "idle";
  room.runId = null;
  room.checkpointId = null;
});

const EVERY_PHASE: {
  phase: RunPhase;
  runId: string | null;
  checkpointId: string | null;
}[] = [
  // A BRAND-NEW SESSION: no run, nothing waiting. The case the walk-3 fix was
  // never tested against, and the case every first-time Expert is in.
  { phase: "idle", runId: null, checkpointId: null },
  { phase: "waiting_human", runId: "run-1", checkpointId: "ckpt-1" },
  { phase: "complete", runId: "run-1", checkpointId: null },
  { phase: "error", runId: "run-1", checkpointId: null },
  { phase: "running", runId: "run-1", checkpointId: null },
  { phase: "starting", runId: null, checkpointId: null },
];

describe("a Finish needs no run", () => {
  it.each(EVERY_PHASE)(
    "in phase $phase it sends one finish request and never starts a round",
    async ({ phase, runId, checkpointId }) => {
      room.runPhase = phase;
      room.runId = runId;
      room.checkpointId = checkpointId;
      mount();

      await act(async () => {
        await finishFn!();
      });

      expect(calls).toEqual([
        {
          path: "/vision-interview/sessions/{session_id}/finish",
          method: "POST",
        },
      ]);
      // Said separately so a failure names the defect rather than a diff.
      expect(
        calls.some((c) => c.path.endsWith("/start")),
      ).toBe(false);
      expect(calls.some((c) => c.path.includes("/resume"))).toBe(false);
    },
  );

  it("offers no way to start a run at all — the door is gone, not hidden", () => {
    mount();
    // `start` was the only caller of `/vision-interview/.../start`, and a run's
    // first act is a full interview round. Returning it again, under any name,
    // reopens the defect.
    const returned = Object.keys(
      (function () {
        let api: Record<string, unknown> = {};
        function Probe() {
          api = useInterviewRun("session-1") as unknown as Record<string, unknown>;
          return <div />;
        }
        const c = document.createElement("div");
        document.body.appendChild(c);
        const r = createRoot(c);
        act(() => {
          r.render(<Probe />);
        });
        act(() => r.unmount());
        c.remove();
        return api;
      })(),
    );
    expect(returned).not.toContain("start");
    expect(returned).toContain("finish");
  });
});
