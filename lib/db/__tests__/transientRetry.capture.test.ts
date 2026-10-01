/**
 * The retry helper and the browser capture proxy, wired together for real.
 *
 * 2026-10-01: the super-admin dock's `scheduler.system_schedule_alarms` poll was
 * cancelled once at the 8 s statement timeout during a live-DDL lock storm and
 * landed as a red inspector row. The proxy captures every failed call when it
 * resolves — before any retry owner has decided to ask again — so a transient
 * that the helper RECOVERS must not be captured, while a transient it gives up
 * on, and any failure it does not retry, must be captured exactly once.
 */
import { withTransientRetry } from "@/lib/db/transientRetry";
import { wrapClientForCapture } from "@/lib/diagnostics/supabaseErrorCapture";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";

type Result = { data: unknown; error: { code: string; message: string } | null; status: number };

const timeout: Result = {
  data: null,
  error: { code: "57014", message: "canceling statement due to statement timeout" },
  status: 500,
};
const ok: Result = { data: [{ task_id: "t1" }], error: null, status: 200 };
const forbidden: Result = {
  data: null,
  error: { code: "42501", message: "scheduler_alarms_forbidden: super-admin only" },
  status: 403,
};

/** A client whose `rpc` answers with the next scripted result on each call. */
function scriptedClient(results: Result[]) {
  let call = 0;
  const raw = {
    rpc: () => ({
      then(onFulfilled: (value: unknown) => unknown) {
        const next = results[Math.min(call, results.length - 1)];
        call += 1;
        return Promise.resolve(onFulfilled(next));
      },
    }),
  };
  const client = wrapClientForCapture(raw) as unknown as {
    rpc: (fn: string) => PromiseLike<Result>;
  };
  return { client, calls: () => call };
}

const quiet = { warn: () => {}, sleep: async () => {} };

describe("withTransientRetry owns capture for the attempts it retries", () => {
  beforeEach(() => clearCapturedErrors());

  it("captures nothing when a statement timeout clears on the next attempt", async () => {
    const { client, calls } = scriptedClient([timeout, ok]);
    const res = await withTransientRetry("scheduler.system_schedule_alarms", () =>
      client.rpc("system_schedule_alarms"),
    quiet);
    expect(res.error).toBeNull();
    expect(calls()).toBe(2);
    expect(getSnapshot()).toHaveLength(0);
  });

  it("captures exactly once when every attempt times out", async () => {
    const { client, calls } = scriptedClient([timeout]);
    const res = await withTransientRetry("scheduler.system_schedule_alarms", () =>
      client.rpc("system_schedule_alarms"),
    quiet);
    expect(res.error?.code).toBe("57014");
    expect(calls()).toBe(3);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({ source: "supabase-postgrest", code: "57014" });
  });

  it("captures a deterministic refusal on the first attempt and does not retry it", async () => {
    const { client, calls } = scriptedClient([forbidden, ok]);
    const res = await withTransientRetry("scheduler.system_schedule_alarms", () =>
      client.rpc("system_schedule_alarms"),
    quiet);
    expect(res.error?.code).toBe("42501");
    expect(calls()).toBe(1);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({ code: "42501" });
  });
});
