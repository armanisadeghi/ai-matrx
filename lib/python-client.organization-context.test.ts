/** @jest-environment node */
/**
 * Locks in the fix for lib/python-client.ts's organization handling: an
 * outbound request that reaches no organization — neither the currently
 * selected one in Redux nor an explicit `opts.organizationId` override —
 * must NEVER fire. Before this fix, `buildHeaders` only attached
 * `X-Organization-Id` when the caller happened to pass `organizationId`
 * (lib/python-client.ts:413, pre-fix), so 42/48 consuming files sent
 * completely unscoped requests. Under aidream commit 8e5ee0b93 (the
 * AuthMiddleware `organization_required` admission gate) every one of those
 * would 400 server-side; this test proves the client now refuses BEFORE any
 * networking happens, matching the sender-side fail-closed requirement in
 * common-docs/projects/no-db-assigned-org/PLAN.md.
 *
 * Each refusal is paired with a positive control that could independently
 * fail — a gate that always throws would also "pass" the refusal test alone.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      })),
    },
  },
}));

jest.mock("@/lib/services/fingerprint-service", () => ({
  getCachedFingerprint: () => null,
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/diagnostics/capturePythonClientError", () => ({
  capturePythonClientError: jest.fn(),
  relationPathFromUrl: (path: string) => path.split("?")[0],
}));

const TEST_ORG_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const OTHER_ORG_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

// Mutable per-test "Redux" stand-in — mirrors how `resolveBaseUrl` and now
// `resolveRequestOrganizationId` read `getStore()` without a real store.
// `orgBootstrapResolved: true` = the active-org bootstrap has authoritatively
// finished, so `waitForOrganizationAdmission` settles immediately instead of
// running its bounded real-time wait inside the tests.
let selectedOrganizationId: string | null = null;
let orgBootstrapResolved = true;
const storeListeners = new Set<() => void>();

// Both accessor names resolve to the SAME fake: `python-client` still reads
// the store through the `getStore` migration alias, while the admission kernel
// reads the canonical `getStoreSingleton`.
const fakeStore = () => ({
  getState: () => ({
    appContext: {
      organization_id: selectedOrganizationId,
      orgBootstrapResolved,
    },
  }),
  subscribe: (listener: () => void) => {
    storeListeners.add(listener);
    return () => storeListeners.delete(listener);
  },
});

jest.mock("@/lib/redux/store-singleton", () => ({
  getStore: () => fakeStore(),
  getStoreSingleton: () => fakeStore(),
}));

import { getJson, postJson, buildHeaders } from "@/lib/python-client";
import { OrganizationContextError } from "@/lib/api/organization-context";

describe("python-client organization admission (sender-side, fail-closed)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    selectedOrganizationId = null;
    orgBootstrapResolved = true;
    storeListeners.clear();
  });

  it("REFUSAL: buildHeaders throws before networking when no organization is selected or supplied", async () => {
    await expect(buildHeaders({}, false)).rejects.toThrow(
      OrganizationContextError,
    );
  });

  it("CONTROL: buildHeaders attaches X-Organization-Id when Redux has a selected organization", async () => {
    selectedOrganizationId = TEST_ORG_ID;
    const { headers } = await buildHeaders({}, false);
    expect(headers["X-Organization-Id"]).toBe(TEST_ORG_ID);
  });

  it("CONTROL: an explicit opts.organizationId wins over (and does not require) a Redux selection", async () => {
    selectedOrganizationId = null;
    const { headers } = await buildHeaders(
      { organizationId: OTHER_ORG_ID },
      false,
    );
    expect(headers["X-Organization-Id"]).toBe(OTHER_ORG_ID);
  });

  it("REFUSAL: getJson never calls fetch when no organization is reachable", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      getJson("/files/test/asset", {
        baseUrlOverride: "https://files.example.test",
      }),
    ).rejects.toThrow(OrganizationContextError);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("CONTROL: getJson calls fetch with the org header once an organization is selected", async () => {
    selectedOrganizationId = TEST_ORG_ID;
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      getJson<{ ok: boolean }>("/files/test/asset", {
        baseUrlOverride: "https://files.example.test",
      }),
    ).resolves.toMatchObject({ data: { ok: true } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Organization-Id"]).toBe(
      TEST_ORG_ID,
    );
  });

  it("GUEST LANE: a fingerprint-only request sends WITHOUT an organization (the server admits that lane org-less)", async () => {
    // No JWT, guest fingerprint present — the lane a public demo or
    // marketing surface uses. Demanding an org here made /demos/lulu-pricing
    // refuse for every anonymous visitor (live, 2026-08-31).
    const { supabase } = jest.requireMock("@/utils/supabase/client") as {
      supabase: { auth: { getSession: jest.Mock } };
    };
    supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    const { headers } = await buildHeaders(
      { guestFingerprint: "fp-guest-abc" },
      false,
    );
    expect(headers["X-Organization-Id"]).toBeUndefined();
    expect(headers["X-Guest-Fingerprint"]).toBe("fp-guest-abc");
    expect(headers.Authorization).toBeUndefined();
  });

  it("HYDRATION: an authenticated request waits for the org bootstrap instead of refusing at boot", async () => {
    orgBootstrapResolved = false; // boot in progress — nothing resolved yet
    const pending = buildHeaders({}, false);
    // The selection lands a beat later, the way the real bootstrap does.
    selectedOrganizationId = TEST_ORG_ID;
    orgBootstrapResolved = true;
    for (const listener of storeListeners) listener();
    const { headers } = await pending;
    expect(headers["X-Organization-Id"]).toBe(TEST_ORG_ID);
  });

  it("REFUSAL: postJson never calls fetch when no organization is reachable", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      postJson(
        "/podcast/runs/missing/reconcile",
        {},
        { baseUrlOverride: "https://server.example.test" },
      ),
    ).rejects.toThrow(OrganizationContextError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
