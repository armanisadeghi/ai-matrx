/**
 * Organization admission for the DataForSEO client — every request in
 * `client.ts` funnels through `seoRequest` / `seoStreamTerminal`, both of
 * which resolve the selected organization out of Redux and run it through the
 * ONE fail-closed kernel (same pattern and test style as
 * `features/scheduling/service/schedulerClient.organization-context.test.ts`).
 */

import { TextDecoder, TextEncoder } from "node:util";

// jsdom scrubs the Node encoders from the test environment; the client's
// stream reader needs TextDecoder and this test's fake stream needs
// TextEncoder.
Object.assign(globalThis, { TextDecoder, TextEncoder });

const getState = jest.fn();

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState }),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: (state: { organizationId: string | null }) =>
    state.organizationId,
}));

import { OrganizationContextError } from "@/lib/api/organization-context";
import {
  listDataForSeoOperations,
  refreshSiteBacklinks,
} from "./client";

const ORGANIZATION_ID = "11111111-1111-4111-8111-111111111111";

const backlinkRefreshBody: Parameters<typeof refreshSiteBacklinks>[3] = {
  organization_id: ORGANIZATION_ID,
  profile: "weekly",
  detail_limit: 10,
  force_refresh: false,
};

function streamResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index < lines.length
            ? { done: false, value: encoder.encode(`${lines[index++]}\n`) }
            : { done: true, value: undefined },
      }),
    },
  } as unknown as Response;
}

describe("dataforseo client organization admission", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    getState.mockReturnValue({ organizationId: ORGANIZATION_ID });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("stamps the selected organization on plain seoRequest calls", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ operations: [] }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await listDataForSeoOperations("https://seo.example.test", "jwt-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://seo.example.test/providers/dataforseo/operations");
    expect(new Headers(init.headers).get("X-Organization-Id")).toBe(
      ORGANIZATION_ID,
    );
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer jwt-token",
    );
  });

  it("stamps the selected organization on streaming seoStreamTerminal calls", async () => {
    const fetchMock = jest.fn(async () =>
      streamResponse([
        JSON.stringify({
          kind: "seo.backlink_refresh_completed",
          receipt: { run_id: "run-1" },
        }),
      ]),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const receipt = await refreshSiteBacklinks(
      "https://seo.example.test",
      "jwt-token",
      "site-1",
      backlinkRefreshBody,
    );

    expect(receipt).toEqual({ run_id: "run-1" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(new Headers(init.headers).get("X-Organization-Id")).toBe(
      ORGANIZATION_ID,
    );
  });

  it("fails closed before networking when no organization is selected", async () => {
    getState.mockReturnValue({ organizationId: null });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      listDataForSeoOperations("https://seo.example.test", "jwt-token"),
    ).rejects.toBeInstanceOf(OrganizationContextError);
    await expect(
      refreshSiteBacklinks(
        "https://seo.example.test",
        "jwt-token",
        "site-1",
        backlinkRefreshBody,
      ),
    ).rejects.toBeInstanceOf(OrganizationContextError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
