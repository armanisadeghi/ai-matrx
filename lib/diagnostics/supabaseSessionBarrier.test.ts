/**
 * THE SESSION BARRIER, proven through the real wrapper (DD-237).
 *
 * Every test here drives `wrapClientForCapture` — the ONE proxy the browser
 * Supabase client is wrapped in — rather than the barrier module directly, so
 * what is proven is what a call site actually gets. Run against the same tree
 * with the barrier NOT wired into that wrapper, seven of these fail; that RED
 * was taken in a detached worktree on 2026-09-14 (see the lane report), never
 * by weakening the real file.
 *
 * The failure being reproduced: `supabase-js` sends the PUBLISHABLE key as the
 * bearer when `auth.getSession()` yields nothing, PostgREST runs the statement
 * as `anon`, `anon` holds no grant on any application table, and the read comes
 * back `42501 permission denied` at HTTP 401 — silently, with no retry. Two
 * live populations, both covered below: a read racing the session at boot, and
 * a long-lived tab whose session lapsed underneath it.
 */

import { wrapClientForCapture } from "@/lib/diagnostics/supabaseErrorCapture";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";
import {
  SESSION_ATTACH_BUDGET_MS,
  SESSION_RECOVERY_BUDGET_MS,
  WAIT_COOLDOWN_MS,
  resetSessionBarrierForTests,
} from "@/utils/supabase/sessionBarrier";

const COOKIE = "sb-matrx-auth-v2";

const REFUSED_NO_IDENTITY = {
  data: null,
  error: { code: "42501", message: "permission denied for table kind_component" },
  status: 401,
} as const;

const REFUSED_REAL_GRANT_GAP = {
  data: null,
  error: { code: "42501", message: "permission denied for function is_org_admin_for" },
  status: 403,
} as const;

const SERVED = { data: [{ id: "component-1" }], error: null, status: 200 } as const;

function setAuthCookie(present: boolean): void {
  document.cookie = present
    ? `${COOKIE}=base64-session-payload; path=/`
    : `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

interface Harness {
  /** Await the wrapped builder the way a call site does. */
  read(relation: string): Promise<unknown>;
  rpc(fn: string): Promise<unknown>;
  /** Deliver an auth report, as `onAuthStateChange` would. */
  report(hasSession: boolean): void;
  /** What `getSession()` answers from now on. */
  setSession(hasSession: boolean): void;
  getSessionCalls(): number;
  executions(): number;
}

/**
 * A client shaped like the real one: `.auth` carrying `storageKey` (which is
 * how `@supabase/ssr` tells the barrier the cookie's name), plus a builder
 * whose `then` serves the queued results one per execution.
 */
function makeHarness(results: readonly unknown[]): Harness {
  const queue = [...results];
  let executions = 0;
  let sessionNow = false;
  let getSessionCalls = 0;
  let listener: ((event: string, session: unknown) => void) | null = null;

  const builder = {
    then(onFulfilled: (value: unknown) => unknown) {
      executions += 1;
      const next = queue.length > 1 ? queue.shift() : queue[0];
      return Promise.resolve(onFulfilled(next));
    },
  };

  const client = wrapClientForCapture({
    auth: {
      storageKey: COOKIE,
      getSession: async () => {
        getSessionCalls += 1;
        return {
          data: { session: sessionNow ? { access_token: "jwt" } : null },
          error: null,
        };
      },
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
    from: (_relation: string) => builder,
    rpc: (_fn: string) => builder,
  });

  // `.then()` directly, never `Promise.resolve(builder)`: promise assimilation
  // defers the `then` call to a microtask, which would hide whether the barrier
  // sent the request synchronously or made it wait.
  const drive = (thenable: { then: (cb: (v: unknown) => unknown) => unknown }) =>
    Promise.resolve(thenable.then((value) => value) as Promise<unknown>);

  return {
    read: (relation) => drive(client.from(relation)),
    rpc: (fn) => drive(client.rpc(fn)),
    report: (hasSession) => {
      sessionNow = hasSession;
      listener?.(hasSession ? "SIGNED_IN" : "INITIAL_SESSION", hasSession ? {} : null);
    },
    setSession: (hasSession) => {
      sessionNow = hasSession;
    },
    getSessionCalls: () => getSessionCalls,
    executions: () => executions,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  clearCapturedErrors();
  resetSessionBarrierForTests();
  setAuthCookie(false);
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("the wait — a read does not leave before the session attaches", () => {
  it("holds a read whose session is expected, and sends it when the session lands", async () => {
    setAuthCookie(true);
    const h = makeHarness([SERVED]);
    // Auth has reported nothing and `getSession()` has nothing to give: the
    // boot window in which production fired its refused reads.

    const pending = h.read("kind_component");
    await jest.advanceTimersByTimeAsync(1);
    expect(h.executions()).toBe(0); // ← the read has NOT been sent

    h.report(true);
    await expect(pending).resolves.toEqual(SERVED);
    expect(h.executions()).toBe(1);
    expect(getSnapshot()).toHaveLength(0);
  });

  it("proceeds on its own when getSession answers, without waiting for an event", async () => {
    setAuthCookie(true);
    const h = makeHarness([SERVED]);
    h.setSession(true); // auth-js has a session; it just never emitted an event

    await expect(h.read("kind_component")).resolves.toEqual(SERVED);
    expect(h.executions()).toBe(1);
    expect(h.getSessionCalls()).toBeGreaterThanOrEqual(1);
  });

  it("sends synchronously, with no extra tick, once a session is attached", async () => {
    setAuthCookie(true);
    const h = makeHarness([SERVED]);
    h.report(true);

    const pending = h.read("kind_component");
    expect(h.executions()).toBe(1); // ← the healthy path is unchanged
    await expect(pending).resolves.toEqual(SERVED);
  });

  it("never waits on a door declared anonymous-by-design", async () => {
    setAuthCookie(true);
    const h = makeHarness([SERVED]);

    const pending = h.rpc("meet_meeting_by_slug");
    expect(h.executions()).toBe(1);
    await expect(pending).resolves.toEqual(SERVED);
  });

  it("never waits when the browser holds no auth cookie", async () => {
    setAuthCookie(false);
    const h = makeHarness([REFUSED_NO_IDENTITY]);

    const pending = h.read("kind_component");
    expect(h.executions()).toBe(1);
    await expect(pending).resolves.toEqual(REFUSED_NO_IDENTITY);
  });

  it("stops waiting for the rest of the cooldown once one wait has expired", async () => {
    setAuthCookie(true);
    const h = makeHarness([REFUSED_NO_IDENTITY]);

    const first = h.read("kind_component");
    await jest.advanceTimersByTimeAsync(SESSION_ATTACH_BUDGET_MS + 10);
    await jest.advanceTimersByTimeAsync(SESSION_RECOVERY_BUDGET_MS + 10);
    await first;
    expect(h.executions()).toBe(1);

    // A tab holding a cookie it can no longer redeem must not pay the full
    // budget on every read for the rest of its life.
    const second = h.read("kind_component");
    expect(h.executions()).toBe(2);
    await jest.advanceTimersByTimeAsync(SESSION_RECOVERY_BUDGET_MS + 10);
    await second;
    expect(WAIT_COOLDOWN_MS).toBeGreaterThan(SESSION_ATTACH_BUDGET_MS);
  });
});

describe("the retry — one replay after a refusal that carried no identity", () => {
  it("re-resolves the session and replays the read exactly once", async () => {
    setAuthCookie(true);
    const h = makeHarness([REFUSED_NO_IDENTITY, SERVED]);
    h.report(true); // the long-lived tab: auth said "attached" hours ago…
    h.setSession(false); // …and the token behind it is gone
    // The first send is refused; a refresh lands a moment later and auth says so.
    setTimeout(() => h.report(true), 1);

    const pending = h.read("kind_component");
    await jest.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toEqual(SERVED);
    expect(h.executions()).toBe(2);

    // Recovered — announced, never swallowed, and never a red alarm.
    const entries = getSnapshot();
    expect(entries.map((e) => e.code)).toEqual(["SESSION_BARRIER_RECOVERED"]);
    expect(entries[0].tier).toBe("orange");
    expect(entries[0].durable).toBe(false);
    // The refusal itself never reaches the inspector, because it did not stand.
    expect(entries.map((e) => e.message).join(" ")).not.toContain(
      "permission denied for table",
    );
  });

  it("does not replay when the browser is simply signed out, and says so", async () => {
    setAuthCookie(false);
    const h = makeHarness([REFUSED_NO_IDENTITY]);
    h.report(false);

    await expect(h.read("kind_component")).resolves.toEqual(REFUSED_NO_IDENTITY);
    expect(h.executions()).toBe(1);

    const entry = getSnapshot()[0];
    expect(entry.code).toBe("42501");
    expect(entry.sessionState).toBe("signed_out");
  });

  it("stamps pre_attach on a refusal the session never came back from", async () => {
    setAuthCookie(true);
    const h = makeHarness([REFUSED_NO_IDENTITY]);
    h.report(true);
    h.setSession(false);

    const pending = h.read("kind_component");
    await jest.advanceTimersByTimeAsync(SESSION_RECOVERY_BUDGET_MS + 10);
    await expect(pending).resolves.toEqual(REFUSED_NO_IDENTITY);

    const entries = getSnapshot();
    const refusal = entries.find((e) => e.code === "42501");
    expect(refusal?.sessionState).toBe("pre_attach");
    const announcement = entries.find(
      (e) => e.code === "SESSION_BARRIER_UNRECOVERED",
    );
    expect(announcement?.tier).toBe("red");
    expect(announcement?.durable).toBe(true);
    expect(announcement?.message).toContain("sign in again");
  });

  it("fails fast on later refusals once the cooldown says waiting cannot help", async () => {
    setAuthCookie(true);
    const h = makeHarness([REFUSED_NO_IDENTITY]);
    h.report(true);
    h.setSession(false);

    const first = h.read("kind_component");
    await jest.advanceTimersByTimeAsync(SESSION_RECOVERY_BUDGET_MS + 10);
    await first;

    // A page fires dozens of reads. Paying the full recovery budget on each of
    // them would turn one lapsed session into a minute of dead screen.
    const second = h.read("kind_component");
    await jest.advanceTimersByTimeAsync(20);
    await expect(second).resolves.toEqual(REFUSED_NO_IDENTITY);
  });

  it("leaves a REAL grant gap alone — 42501 at 403 is not a session problem", async () => {
    setAuthCookie(true);
    const h = makeHarness([REFUSED_REAL_GRANT_GAP]);
    h.report(true);

    await expect(h.read("credential_items")).resolves.toEqual(
      REFUSED_REAL_GRANT_GAP,
    );
    expect(h.executions()).toBe(1);
    expect(h.getSessionCalls()).toBe(0);
    expect(getSnapshot()[0]?.code).toBe("42501");
    expect(getSnapshot()[0]?.sessionState).toBe("attached");
  });

  it("replays a refused WRITE too — a 42501 wrote nothing to replay over", async () => {
    setAuthCookie(true);
    const h = makeHarness([REFUSED_NO_IDENTITY, SERVED]);
    h.report(true);
    h.setSession(false);
    setTimeout(() => h.report(true), 1);

    const pending = h.rpc("hr_org_jurisdiction_rule_save");
    await jest.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toEqual(SERVED);
    expect(h.executions()).toBe(2);
  });
});
