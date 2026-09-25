/**
 * @jest-environment node
 *
 * The one request ledger, fed by the REAL fetch tap (lane ALCHEMY-2). The tap
 * is installed over a stub transport; every client door the app has — the
 * supabase-js REST and RPC calls, the records data source (same client), the
 * aidream API client, a plain fetch — reaches `globalThis.fetch`, so these
 * calls are what the app's clients send. Red before the ledger existed: the
 * page capture read `apiConfig.recentCalls`, which nothing wrote.
 */

type Reply = { status: number; body: string; type?: string };
const replies: Record<string, Reply> = {
  "POST https://server.app.matrxserver.com/ai/context/preview": { status: 200, body: '{"ok":true}' },
  "PATCH https://db.matrxserver.com/rest/v1/contacts?id=eq.7": {
    status: 403,
    body: JSON.stringify({ code: "42501", details: null, hint: null, message: 'new row violates row-level security policy for table "contacts"' }),
  },
  "POST https://db.matrxserver.com/rest/v1/rpc/answer_both": { status: 200, body: "[]" },
  "POST https://db.matrxserver.com/auth/v1/token?grant_type=password": { status: 200, body: "{}" },
  "POST https://server.app.matrxserver.com/ai/big": { status: 500, body: JSON.stringify({ detail: { message: "The context service is not answering." } }) },
  "GET http://localhost:3000/_next/static/chunks/app.js": { status: 200, body: "", type: "application/javascript" },
};

beforeAll(() => {
  (globalThis as unknown as { window: unknown }).window = { location: { origin: "http://localhost:3000" } };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const key = `${init?.method ?? "GET"} ${url}`;
    const r = replies[key];
    if (!r) throw new TypeError(`Failed to fetch ${key}`);
    return new Response(r.body || null, { status: r.status, headers: { "content-type": r.type ?? "application/json", "X-Request-ID": `rid-${r.status}` } });
  }) as typeof fetch;
});

import { installCaptureTap } from "../install-fetch-tap";
import { getRequestLedger, ledgerForCapture, REQUEST_LEDGER_LIMIT, errorSentenceFrom } from "../request-ledger";

const flush = () => new Promise((r) => setTimeout(r, 20));

describe("the request ledger behind every client path", () => {
  it("records method, path, client, status, duration, the JSON body, and a refusal's own sentence", async () => {
    installCaptureTap();
    await fetch("https://server.app.matrxserver.com/ai/context/preview", {
      method: "POST",
      body: JSON.stringify({ organization_id: "o1", scope_ids: ["s1"], access_token: "eyJ" }),
    });
    const refused = await fetch("https://db.matrxserver.com/rest/v1/contacts?id=eq.7", {
      method: "PATCH",
      body: JSON.stringify({ phone: "+1 949 555 0142" }),
    });
    // The caller still reads the untouched body.
    expect((await refused.json()).code).toBe("42501");
    await fetch("https://db.matrxserver.com/rest/v1/rpc/answer_both", { method: "POST", body: JSON.stringify({ q: "x".repeat(9000) }) });
    await fetch("https://db.matrxserver.com/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email: "a", password: "b" }) });
    await fetch("http://localhost:3000/_next/static/chunks/app.js");
    await expect(fetch("https://unreachable.invalid/x")).rejects.toThrow();
    await flush();

    const all = getRequestLedger();
    expect(all.map((e) => `${e.method} ${e.client}`)).toEqual([
      "GET other",
      "POST supabase-auth",
      "POST supabase-rpc",
      "PATCH supabase-rest",
      "POST aidream",
    ]);
    const compare = all.find((e) => e.path === "/ai/context/preview")!;
    expect(compare).toMatchObject({ status: "success", httpStatus: 200, requestId: "rid-200", baseUrl: "https://server.app.matrxserver.com" });
    expect(compare.requestBody).toEqual({ organization_id: "o1", scope_ids: ["s1"], access_token: "[redacted]" });
    expect(typeof compare.durationMs).toBe("number");

    const patch = all.find((e) => e.method === "PATCH")!;
    expect(patch).toMatchObject({
      status: "error",
      httpStatus: 403,
      errorSentence: 'new row violates row-level security policy for table "contacts"',
      requestBody: { phone: "+1 949 555 0142" },
    });
    expect(all.find((e) => e.client === "supabase-rpc")!.requestBodyNote).toBe("over 8 KB: body not kept");
    const auth = all.find((e) => e.client === "supabase-auth")!;
    expect(auth.requestBody).toBeUndefined();
    expect(auth.requestBodyNote).toBe("auth request: body not kept");
    expect(all.find((e) => e.path.startsWith("/x"))).toMatchObject({ status: "error", errorSentence: expect.stringContaining("Failed to fetch") });

    // The capture's order: failing first.
    const cap = ledgerForCapture(20);
    expect(cap.slice(0, 2).every((e) => e.status === "error")).toBe(true);
  });

  it("keeps the server's words from a FastAPI detail and never invents one", async () => {
    await fetch("https://server.app.matrxserver.com/ai/big", { method: "POST", body: "{}" });
    await flush();
    expect(getRequestLedger()[0]).toMatchObject({ status: "error", httpStatus: 500, errorSentence: "The context service is not answering." });
    expect(errorSentenceFrom("<html>502 Bad Gateway</html>")).toBeUndefined();
    expect(errorSentenceFrom(JSON.stringify({ detail: [{ msg: "field required" }] }))).toBe("field required");
  });

  it("is bounded at the last 50", async () => {
    for (let i = 0; i < 60; i++) await fetch("https://db.matrxserver.com/rest/v1/rpc/answer_both", { method: "POST", body: "{}" });
    await flush();
    expect(getRequestLedger()).toHaveLength(REQUEST_LEDGER_LIMIT);
  });
});
