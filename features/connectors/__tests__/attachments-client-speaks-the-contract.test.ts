/**
 * The attachments client calls the routes aidream actually publishes.
 *
 * On 2026-09-17 every chat with an attachable connection read "HTTP 404"
 * because the client called `/api/conversations/{id}/attachments` while the
 * server mounts the route under `/ai` (`/api/ai/conversations/…`): aidream's
 * compatibility middleware strips `/api`, `/conversations/{id}/attachments`
 * matches nothing, and the failure sentence was bare because the body had
 * already been consumed by a failed `.json()` before `.text()` ran.
 *
 * The route templates are `satisfies keyof paths` in the service (a route the
 * contract does not publish fails `pnpm type-check`); this test pins the
 * resolved URLs and the failure sentences against real fetch responses.
 */

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "jwt-for-test" } },
      }),
    },
  }),
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({ getState: () => ({}) }),
}));

jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: () => "org-1",
}));

jest.mock("@/lib/api/organization-context", () => ({
  requireOrganizationContext: (id: string | null) => {
    if (!id) throw new Error("organization_context_required");
    return id;
  },
  applyOrganizationContextHeader: (
    headers: Record<string, string>,
    organizationId: string,
  ) => ({ ...headers, "X-Organization-Id": organizationId }),
}));

import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import {
  attachConversationResource,
  detachConversationResource,
  fetchAttachableResources,
  fetchConversationAttachments,
} from "../attachments.service";

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit | undefined]>();

/** A real-shaped response: the body is a one-shot stream, exactly like fetch's. */
function respond(status: number, body: string) {
  let consumed = false;
  const read = async () => {
    if (consumed) throw new TypeError("Body has already been consumed.");
    consumed = true;
    return body;
  };
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    text: read,
    json: async () => JSON.parse(await read()) as unknown,
  } as unknown as Response);
}

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe("conversation attachments client — routes", () => {
  it("reads attachments from the /ai-mounted conversation route the contract publishes", async () => {
    respond(200, "[]");

    await expect(fetchConversationAttachments("conv 1")).resolves.toEqual([]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `${AIDREAM_PRODUCTION_URL}/api/ai/conversations/conv%201/attachments`,
    );
    expect(url).not.toContain("/api/conversations/");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer jwt-for-test",
    );
    expect((init?.headers as Record<string, string>)["X-Organization-Id"]).toBe(
      "org-1",
    );
  });

  it("attaches and detaches through the same /ai-mounted routes", async () => {
    respond(200, JSON.stringify({ association_id: "a1" }));
    await attachConversationResource("c1", {
      provider: "github",
      resource_ref: "org/repo",
      resource_type: "repository",
      display_name: "org/repo",
      link: null,
      metadata: null,
    } as never);
    respond(204, "");
    await detachConversationResource("c1", "a/1");

    expect(fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${url}`)).toEqual([
      `POST ${AIDREAM_PRODUCTION_URL}/api/ai/conversations/c1/attachments`,
      `DELETE ${AIDREAM_PRODUCTION_URL}/api/ai/conversations/c1/attachments/a%2F1`,
    ]);
  });

  it("asks for candidates on the bare /connections route", async () => {
    respond(200, "[]");
    await fetchAttachableResources({ provider: "google", query: "q", live: true });
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${AIDREAM_PRODUCTION_URL}/api/connections/resources?provider=google&q=q&live=true`,
    );
  });
});

describe("conversation attachments client — failure sentences", () => {
  it("names the status AND the route when the body carries no detail", async () => {
    respond(404, "<html>not json</html>");

    await expect(fetchConversationAttachments("c1")).rejects.toThrow(
      "HTTP 404 from GET /api/ai/conversations/c1/attachments",
    );
  });

  it("uses aidream's structured detail — message plus remedy — verbatim", async () => {
    respond(
      403,
      JSON.stringify({
        detail: {
          code: "not_owner",
          message: "This chat is not yours to attach to.",
          remedy: "Open one of your own chats.",
        },
      }),
    );

    await expect(attachConversationResource("c1", {} as never)).rejects.toThrow(
      "This chat is not yours to attach to. Open one of your own chats.",
    );
  });

  it("uses a plain FastAPI string detail as the sentence", async () => {
    respond(404, JSON.stringify({ detail: "Not Found" }));

    await expect(fetchConversationAttachments("c1")).rejects.toThrow("Not Found");
  });
});
