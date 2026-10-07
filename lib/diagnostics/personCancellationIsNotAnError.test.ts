/**
 * The person's own Stop is an answer, never an error (PB-05 W-49, 2026-10-01).
 *
 * Break this guards: a Stop pressed during a run surfaced in the Error
 * Inspector as a RED "Rejected action (thunk) · instances/smartExecute ·
 * Cancelled" (tier "Clear Error — dead user turn"). The execution thunks
 * reject "Cancelled" for a person-initiated stop; the capture middleware must
 * recognise that rejection by its marker and file nothing — while a real dead
 * turn (a heartbeat death) through the SAME thunks is still captured.
 */
import { configureStore, createAsyncThunk } from "@reduxjs/toolkit";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import { reduxErrorCaptureMiddleware } from "@/lib/diagnostics/reduxErrorCaptureMiddleware";
import {
  executionRejectionMeta,
  serializeExecutionRejection,
} from "@/lib/diagnostics/executionRejectionMeta";
import { StreamCancelledError } from "@ai-matrx/chat/agents/redux/execution-system/thunks/run-ai-stream";
import { OrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";

const CONVERSATION = "e2acdae2-eb77-4c99-9511-f3d591d4841c";

/** The executeInstance → smartExecute chain, shaped exactly as production. */
function chainFor(cause: Error, payload: string) {
  const execute = createAsyncThunk<
    void,
    void,
    { rejectedMeta: ReturnType<typeof executionRejectionMeta> }
  >("instances/execute", async (_arg, { rejectWithValue }) =>
    rejectWithValue(
      payload,
      executionRejectionMeta("req-whitcombe", CONVERSATION, cause.name),
    ),
  );
  const smart = createAsyncThunk(
    "instances/smartExecute",
    async (_arg: void, { dispatch }) => {
      const r = await dispatch(execute());
      if (execute.rejected.match(r)) {
        throw Object.assign(new Error(String(r.payload)), {
          conversationId: CONVERSATION,
          executionRequestId: r.meta.executionRequestId,
          originalErrorName: r.meta.originalErrorName,
        });
      }
    },
    { serializeError: serializeExecutionRejection },
  );
  return smart;
}

async function run(cause: Error, payload: string) {
  const store = configureStore({
    reducer: () => ({}),
    middleware: (d) => d().concat(reduxErrorCaptureMiddleware),
  });
  await store.dispatch(chainFor(cause, payload)());
  return getSnapshot();
}

describe("a person's cancellation never reaches the Error Inspector", () => {
  beforeEach(() => clearCapturedErrors());

  it.each([
    ["Stop during a run", new StreamCancelledError(), "Cancelled"],
    ["closing the organization picker", new OrganizationSelectionCancelled(), "Cancelled"],
  ])("files nothing for %s", async (_label, cause, payload) => {
    expect(await run(cause, payload)).toEqual([]);
  });

  it("still files a real dead turn through the same thunks", async () => {
    const heartbeat = Object.assign(new Error("dead"), {
      name: "HeartbeatTimeoutError",
    });
    const captured = await run(
      heartbeat,
      "No server activity for 30000ms — stream considered dead",
    );
    expect(captured.map((c) => c.relation).sort()).toEqual(
      ["instances/execute", "instances/smartExecute"].sort(),
    );
    expect(captured.every((c) => c.name === "HeartbeatTimeoutError")).toBe(true);
  });
});

/**
 * CENSUS: every execution thunk that rejects "Cancelled" names the cause, so
 * a new cancellation site cannot silently fall back to the red dead-turn tier.
 * Self-check: the regex finds the four live sites; a bare
 * `rejectWithValue("Cancelled")` fails it.
 */
describe("every 'Cancelled' rejection names its cause", () => {
  const fs = require("node:fs") as typeof import("node:fs");
  const path = require("node:path") as typeof import("node:path");
  const dir = path.join(
    process.cwd(),
    "../aidream/apps/shared/chat/src/agents/redux/execution-system/thunks",
  );
  const sites = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .flatMap((f) =>
      fs
        .readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .map((line, i) => ({ where: `${f}:${i + 1}`, line }))
        .filter(({ line }) => /return\s+rejectWithValue\(\s*"Cancelled"/.test(line)),
    );

  it("finds the live cancellation sites", () => {
    expect(sites.length).toBeGreaterThanOrEqual(4);
  });

  it("passes a person-cancellation name at every site", () => {
    const bare = sites.filter(({ line }) =>
      /rejectWithValue\(\s*"Cancelled"\s*\)/.test(line),
    );
    expect(bare.map((b) => b.where)).toEqual([]);
  });
});
