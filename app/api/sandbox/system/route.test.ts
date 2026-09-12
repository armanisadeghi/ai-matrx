/** @jest-environment node */

import { fetchTierInfo } from "./route";

jest.mock("@/lib/sandbox/orchestrator-routing", () => ({
  resolveOrchestratorByTier: (tier: string) => ({
    tier,
    url: `https://${tier}.example.test`,
    apiKey: `${tier}-key`,
  }),
  orchestratorJsonHeaders: (target: { apiKey: string }) => ({
    "X-API-Key": target.apiKey,
  }),
}));

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));

afterEach(() => {
  jest.restoreAllMocks();
});

test("reads protected release metadata and route inventory with the tier key", async () => {
  const fetch = jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ uptime_seconds: 1 }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          version: "0.2.0",
          source_sha: "5f4dcc3b5aa765d61d8327deb882cf99e3c1e99d",
        }),
        { status: 200 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ routes: [{ path: "/health" }, { path: "/system" }] }), { status: 200 }),
    );

  const result = await fetchTierInfo("hosted");

  expect(result).toMatchObject({
    ok: true,
    release: { version: "0.2.0", sourceSha: "5f4dcc3b5aa765d61d8327deb882cf99e3c1e99d" },
    routeCount: 2,
  });
  expect(fetch).toHaveBeenCalledWith(
    "https://hosted.example.test/",
    expect.objectContaining({ headers: { "X-API-Key": "hosted-key" } }),
  );
  expect(fetch).toHaveBeenCalledWith(
    "https://hosted.example.test/api-surface",
    expect.objectContaining({ headers: { "X-API-Key": "hosted-key" } }),
  );
});

test.each(["dev", "abc123", "not-a-git-sha-000000000000000000000000000"]) (
  "does not present %p as a deployed source SHA",
  async (sourceSha) => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ uptime_seconds: 1 }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ version: "0.2.0", source_sha: sourceSha }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ routes: [] }), { status: 200 }));

    const result = await fetchTierInfo("hosted");

    expect(result.release).toEqual({ version: "0.2.0", sourceSha: undefined });
  },
);

test("does not invent a release or route count when metadata is unavailable", async () => {
  jest
    .spyOn(global, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ uptime_seconds: 1 }), { status: 200 }))
    .mockResolvedValueOnce(new Response("forbidden", { status: 403 }))
    .mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

  const result = await fetchTierInfo("ec2");

  expect(result).toMatchObject({ ok: true });
  expect(result.release).toEqual({ version: undefined, sourceSha: undefined });
  expect(result.routeCount).toBeUndefined();
});
