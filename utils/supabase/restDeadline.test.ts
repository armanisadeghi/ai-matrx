/**
 * @jest-environment node
 */
/**
 * THE REST DEADLINE on a REAL supabase-js client. The stub fetch reproduces
 * the 2026-10-03 incident: a PostgREST socket that never answers (it only
 * settles when its signal aborts). Without the deadline, the query below never
 * resolves and the route burns the whole Vercel function limit.
 */
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_REST_DEADLINE_MS,
  deadlineFetch,
  installRestDeadline,
  isRestDeadlineError,
  restDeadlineMs,
} from "./restDeadline";

function stalledClient() {
  let calls = 0;
  const hangingFetch = (_input: RequestInfo | URL, init?: RequestInit) => {
    calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  };
  const client = createClient("http://stall.test", "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: hangingFetch as typeof fetch },
  });
  return { client, calls: () => calls };
}

function answeringClient() {
  const fetchStub = async () =>
    new Response(JSON.stringify([{ id: 1 }]), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  return createClient("http://ok.test", "sb_publishable_test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchStub as typeof fetch },
  });
}

/** Resolves to "hung" if `p` has not settled within `ms`. */
function raceHang<T>(p: Promise<T>, ms: number): Promise<T | "hung"> {
  return Promise.race([p, new Promise<"hung">((r) => setTimeout(() => r("hung"), ms))]);
}

describe("installRestDeadline", () => {
  it("a stalled database answers with an error inside the deadline instead of hanging", async () => {
    const { client } = stalledClient();
    installRestDeadline(client, 50);
    const result = await raceHang(Promise.resolve(client.from("sandbox_instances").select("id")), 1_000);
    expect(result).not.toBe("hung");
    if (result === "hung") return;
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(isRestDeadlineError(result.error)).toBe(true);
  });

  it("after one stall, every later call on the same client fails at once without touching the socket", async () => {
    const { client, calls } = stalledClient();
    installRestDeadline(client, 50);
    await client.from("a").select("id");
    expect(calls()).toBe(1);
    const started = Date.now();
    const second = await client.rpc("anything");
    expect(Date.now() - started).toBeLessThan(40);
    expect(isRestDeadlineError(second.error)).toBe(true);
    expect(calls()).toBe(1);
  });

  it("the fail-fast window ends: a long-lived client tries the socket again after it", async () => {
    let clock = 1_000;
    let calls = 0;
    const hanging = (_i: RequestInfo | URL, init?: RequestInit) => {
      calls += 1;
      return new Promise<Response>((_r, reject) =>
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
      );
    };
    const f = deadlineFetch(hanging, 30, () => clock);
    await expect(f("http://x/rest/v1/a")).rejects.toThrow(/server deadline/);
    await expect(f("http://x/rest/v1/a")).rejects.toThrow(/failing fast/);
    expect(calls).toBe(1);
    clock += 31;
    await expect(f("http://x/rest/v1/a")).rejects.toThrow(/within the 30ms/);
    expect(calls).toBe(2);
  });

  it("covers every PostgREST door (.schema().from())", async () => {
    const { client } = stalledClient();
    installRestDeadline(client, 50);
    const result = await raceHang(Promise.resolve(client.schema("files").from("user_account").select("tier_id")), 1_000);
    expect(result).not.toBe("hung");
  });

  it("leaves a healthy database untouched", async () => {
    const client = installRestDeadline(answeringClient(), 50);
    const { data, error } = await client.from("t").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 1 }]);
  });

  it("is idempotent", async () => {
    const { client } = stalledClient();
    installRestDeadline(client, 50);
    installRestDeadline(client, 10_000);
    const result = await raceHang(Promise.resolve(client.from("a").select("id")), 1_000);
    expect(result).not.toBe("hung");
  });

  it("refuses a client it cannot bound", () => {
    expect(() => installRestDeadline({} as object, 50)).toThrow(/rest\.fetch/);
  });
});

describe("restDeadlineMs", () => {
  it("defaults below the 15s function limit and honors a valid knob", () => {
    expect(DEFAULT_REST_DEADLINE_MS).toBeLessThan(15_000);
    expect(restDeadlineMs({})).toBe(DEFAULT_REST_DEADLINE_MS);
    expect(restDeadlineMs({ SUPABASE_SERVER_REST_DEADLINE_MS: "4000" })).toBe(4000);
    expect(restDeadlineMs({ SUPABASE_SERVER_REST_DEADLINE_MS: "nope" })).toBe(DEFAULT_REST_DEADLINE_MS);
    expect(restDeadlineMs({ SUPABASE_SERVER_REST_DEADLINE_MS: "-5" })).toBe(DEFAULT_REST_DEADLINE_MS);
  });
});
