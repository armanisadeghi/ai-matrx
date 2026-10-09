import { TextDecoder as NodeTextDecoder } from "node:util";

// Every request in `client.ts` is organization-admitted (fail-closed) — these
// command tests are about the NDJSON envelope, so they run with an
// organization selected. The admission contract itself is proven in
// `client.organization-context.test.ts`.
const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

jest.mock("@/lib/redux/store-singleton", () => ({
  // The gate (lib/organization/organization-gate.ts) reads this exact shape.
  getStoreSingleton: () => ({
    getState: () => ({ appContext: { organization_id: ORGANIZATION_ID, orgBootstrapResolved: true } }),
  }),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => ORGANIZATION_ID,
}));

import { enrichSiteBacklinks, refreshSiteBacklinks } from "./client";

/** A real NDJSON response (the core reader needs real headers and body). */
function ndjsonResponse(payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function ndjsonLinesResponse(payloads: Record<string, unknown>[]): Response {
  return new Response(
    payloads.map((payload) => JSON.stringify(payload)).join("\n"),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } },
  );
}

describe("SEO backlink work commands", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "fetch", {
      value: jest.fn(),
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "TextDecoder", {
      value: NodeTextDecoder,
      configurable: true,
      writable: true,
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "fetch");
    Reflect.deleteProperty(globalThis, "TextDecoder");
  });

  it("routes refresh through AI Dream and consumes a terminal line without a trailing newline", async () => {
    const receipt = { site_id: "site-1", profile: "weekly", datasets: [] };
    const fetchMock = jest.mocked(globalThis.fetch).mockResolvedValue(
      ndjsonResponse({
        data: { kind: "seo.backlink_refresh_completed", receipt },
      }),
    );

    await expect(
      refreshSiteBacklinks("https://server.example", "token", "site-1", {
        organization_id: "org-1",
        profile: "weekly",
        detail_limit: 100,
        force_refresh: true,
        enrichment_limit: 25,
      }),
    ).resolves.toEqual(receipt);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://server.example/seo/sites/site-1/backlinks/refresh",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns the enrichment result from the durable command envelope", async () => {
    const result = {
      result_kind: "backlinks.enrich",
      site_id: "site-1",
      requested: 2,
      completed: 2,
      queue: { completed: 2 },
      items: [],
    };
    jest.mocked(globalThis.fetch).mockResolvedValue(
      ndjsonResponse({
        data: { kind: "seo.backlink_enrichment_completed", result },
      }),
    );

    await expect(
      enrichSiteBacklinks("https://server.example", "token", "site-1", {
        organization_id: "org-1",
        limit: 25,
        force: false,
      }),
    ).resolves.toEqual(result);
  });

  it("forwards every progress event and targeted backlink ids", async () => {
    const result = {
      result_kind: "backlinks.enrich" as const,
      site_id: "site-1",
      requested: 1,
      claimed: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
      queue: { completed: 1 },
      items: [],
    };
    const onEvent = jest.fn();
    const fetchMock = jest.mocked(globalThis.fetch).mockResolvedValue(
      ndjsonLinesResponse([
        { data: { kind: "seo.command_run", run_id: "run-1" } },
        {
          data: {
            kind: "seo.backlink_capture_started",
            backlink_id: "link-1",
            source_url: "https://example.com/source",
          },
        },
        { data: { kind: "seo.backlink_enrichment_completed", result } },
      ]),
    );

    await expect(
      enrichSiteBacklinks(
        "https://server.example",
        "token",
        "site-1",
        {
          organization_id: "org-1",
          limit: 1,
          force: true,
          backlink_ids: ["link-1"],
        },
        onEvent,
      ),
    ).resolves.toEqual(result);

    expect(onEvent.mock.calls.map(([event]) => event.kind)).toEqual([
      "seo.command_run",
      "seo.backlink_capture_started",
      "seo.backlink_enrichment_completed",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual(
      expect.objectContaining({ backlink_ids: ["link-1"], force: true }),
    );
  });
});
