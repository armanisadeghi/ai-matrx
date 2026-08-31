/** @jest-environment node */
/**
 * Locks in the fix for lib/api/backend-client.ts's organization handling.
 *
 * Pre-fix, `BackendClient.mergeScope()` only wrote `organization_id` into
 * the outgoing JSON body (lib/api/backend-client.ts:293, pre-fix) — never
 * into a header — so an authenticated (`token`/`fingerprint`) request never
 * carried `X-Organization-Id` at all. Under aidream commit 8e5ee0b93 (the
 * AuthMiddleware `organization_required` admission gate, which is header-
 * only and runs BEFORE routing, before any handler could read the body)
 * every such request would 400 server-side. This proves the client now
 * refuses BEFORE any networking when identified and un-scoped, and that an
 * anonymous (unidentified) client — exempt from the server gate, since it
 * carries no ctx.user_id — is correctly left alone.
 */

import {
  createAuthenticatedClient,
  createGuestClient,
  createPublicClient,
} from "@/lib/api/backend-client";
import { OrganizationContextError } from "@/lib/api/organization-context";

const ORG_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

describe("BackendClient organization admission (sender-side, fail-closed)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("REFUSAL: an authenticated (token) client with no organization scope never calls fetch", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createAuthenticatedClient(
      "test-token",
      "https://server.example.test",
    );
    await expect(client.getJson("/some/endpoint")).rejects.toThrow(
      OrganizationContextError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CONTROL: an authenticated (token) client WITH an organization scope attaches X-Organization-Id and calls fetch", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createAuthenticatedClient(
      "test-token",
      "https://server.example.test",
      { organization_id: ORG_ID },
    );
    await expect(client.getJson("/some/endpoint")).resolves.toEqual({
      ok: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Organization-Id"]).toBe(
      ORG_ID,
    );
  });

  it("GUEST LANE: a fingerprint client with no organization scope sends WITHOUT one — the server admits that lane org-less (matrx-connect 241750bf6)", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createGuestClient("fp-123", "https://server.example.test");
    await expect(client.getJson("/some/endpoint")).resolves.toEqual({
      ok: true,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Fingerprint-ID"]).toBe("fp-123");
    expect(headers["X-Organization-Id"]).toBeUndefined();
  });

  it("CONTROL: an unidentified (anonymous/public) client is exempt — no org required, request proceeds", async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createPublicClient("https://server.example.test");
    await expect(client.getJson("/health")).resolves.toEqual({
      status: "ok",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
