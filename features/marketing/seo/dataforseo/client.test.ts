import { TextDecoder as NodeTextDecoder } from "node:util";
import { enrichSiteBacklinks, refreshSiteBacklinks } from "./client";

function ndjsonResponse(payload: Record<string, unknown>): Response {
  const bytes = Uint8Array.from(
    [...JSON.stringify(payload)].map((character) => character.charCodeAt(0)),
  );
  let sent = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
      }),
    },
  } as unknown as Response;
}

function ndjsonLinesResponse(payloads: Record<string, unknown>[]): Response {
  const text = payloads.map((payload) => JSON.stringify(payload)).join("\n");
  const bytes = Uint8Array.from(
    [...text].map((character) => character.charCodeAt(0)),
  );
  let sent = false;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: bytes };
        },
      }),
    },
  } as unknown as Response;
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
