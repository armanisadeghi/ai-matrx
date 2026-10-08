/**
 * matrx-transport.test.ts — the host `MatrxTransport` port implementation.
 *
 * Proves the port contract (`@ai-matrx/agents/matrx`): the host prepends its
 * resolved base URL, merges policy headers (auth, org) ON TOP of the wire
 * headers without dropping them, and wires the caller's signal into the
 * underlying fetch — plus callApi parity: AI-version path transform, capture
 * sinks, expected-status suppression, and the cancel flow's result envelope.
 */

import type { RootState } from "@/lib/redux/store";

jest.mock("@ai-matrx/data/net", () => ({
  resilientFetch: jest.fn(),
  isNetError: () => false,
}));
jest.mock("@/lib/diagnostics/captureApiError", () => ({
  captureApiError: jest.fn(),
}));
jest.mock("@/lib/api/log-api-target", () => ({ logApiTarget: jest.fn() }));
jest.mock("@/lib/redux/slices/userSlice", () => ({
  selectAccessToken: (state: { accessToken?: string | null }) =>
    state.accessToken ?? null,
  selectFingerprintId: (state: { fingerprintId?: string | null }) =>
    state.fingerprintId ?? null,
  selectIsSuperAdmin: () => false,
  selectIsAuthenticated: (state: { accessToken?: string | null }) =>
    !!state.accessToken,
  selectAuthReady: (state: { authReady?: boolean }) => state.authReady ?? true,
}));
jest.mock("@/lib/redux/slices/apiConfigSlice", () => ({
  selectResolvedBaseUrl: (state: { baseUrl?: string }) =>
    state.baseUrl ?? "https://backend.test",
  selectEndpointOverrideConfig: () => null,
  selectAiApiVersion: (state: { aiApiVersion?: string }) =>
    state.aiApiVersion ?? "v1",
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectOrganizationId: (state: { organizationId?: string | null }) =>
    state.organizationId ?? null,
  selectProjectId: () => null,
  selectTaskId: () => null,
  selectConversationId: () => null,
}));
// A write waits for the load ladder, then carries the active organization (the default state's).
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async () => "11111111-1111-4111-8111-111111111111",
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));

import { resilientFetch } from "@ai-matrx/data/net";
import { captureApiError } from "@/lib/diagnostics/captureApiError";
import {
  cancelAgentRunRequest,
  createMatrxTransport,
} from "@/lib/api/matrx-transport";

const mockedFetch = resilientFetch as jest.MockedFunction<
  typeof resilientFetch
>;
const mockedCapture = captureApiError as jest.Mock;

interface FakeStateShape {
  authReady?: boolean;
  accessToken?: string | null;
  fingerprintId?: string | null;
  organizationId?: string | null;
  baseUrl?: string;
  aiApiVersion?: string;
  appContext?: Record<string, unknown>;
}

function stateOf(overrides: FakeStateShape = {}): () => RootState {
  const state = {
    accessToken: "jwt-token",
    organizationId: "11111111-1111-4111-8111-111111111111",
    appContext: {},
    apiConfig: { activeServer: "production" },
    ...overrides,
  };
  return () => state as unknown as RootState;
}

function fakeResponse(args: {
  ok?: boolean;
  status?: number;
  json?: unknown;
}): Response {
  const body = args.json ?? {};
  const response = {
    ok: args.ok ?? true,
    status: args.status ?? 200,
    headers: { get: () => null },
    json: async () => body,
    clone() {
      return this;
    },
  };
  return response as unknown as Response;
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockedCapture.mockReset();
});

describe("createMatrxTransport (global, callApi parity)", () => {
  it("prepends the base URL and merges policy headers on top of wire headers without dropping them", async () => {
    mockedFetch.mockResolvedValue({ response: fakeResponse({}), controller: new AbortController() });
    const transport = createMatrxTransport(stateOf());

    // eslint-disable-next-line no-restricted-syntax -- a URL fixture for the header-merge assertion, not a tool-results POST; the transport under test is path-agnostic.
    await transport.fetch("/ai/conversations/c-1/tool_results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockedFetch.mock.calls[0];
    // eslint-disable-next-line no-restricted-syntax -- the expected value of the fixture URL above, not a tool-results POST.
    expect(url).toBe("https://backend.test/ai/conversations/c-1/tool_results");
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/json",
      Authorization: "Bearer jwt-token",
      "X-Organization-Id": "11111111-1111-4111-8111-111111111111",
    });
  });

  it("a call made before the session hydrates waits for it and carries the bearer (/p Applet describe was a bare 401)", async () => {
    mockedFetch.mockResolvedValue({ response: fakeResponse({}), controller: new AbortController() });
    const state: FakeStateShape & Record<string, unknown> = {
      authReady: false,
      accessToken: null,
      organizationId: "11111111-1111-4111-8111-111111111111",
      appContext: {},
      apiConfig: { activeServer: "production" },
    };
    const transport = createMatrxTransport(() => state as unknown as RootState);
    setTimeout(() => {
      state.accessToken = "jwt-late";
      state.authReady = true;
    }, 1500);

    // The package resolves its own copy of @ai-matrx/data/net, so the wire is read at fetch itself.
    const wire = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
    try {
      await transport.fetch("/mandates/app.x/describe", { method: "GET", headers: {} });
      const init = wire.mock.calls[0]?.[1];
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer jwt-late");
    } finally {
      wire.mockRestore();
    }
  });

  it("preserves wire-semantic streaming headers (Accept, Last-Event-ID)", async () => {
    mockedFetch.mockResolvedValue({ response: fakeResponse({}), controller: new AbortController() });
    const transport = createMatrxTransport(stateOf());

    await transport.fetch("/runtime/executions/e-1/events/stream", {
      method: "GET",
      headers: { Accept: "text/event-stream", "Last-Event-ID": "42" },
    });

    const [, init] = mockedFetch.mock.calls[0];
    expect(init?.headers).toMatchObject({
      Accept: "text/event-stream",
      "Last-Event-ID": "42",
      Authorization: "Bearer jwt-token",
    });
    // No policy Content-Type forced onto a bodyless GET.
    expect(
      (init?.headers as Record<string, string>)["Content-Type"],
    ).toBeUndefined();
  });

  it("wires the caller's AbortSignal into the underlying fetch", async () => {
    mockedFetch.mockResolvedValue({ response: fakeResponse({}), controller: new AbortController() });
    const controller = new AbortController();
    const transport = createMatrxTransport(stateOf());

    await transport.fetch("/ai/cancel/r-1", {
      method: "POST",
      headers: {},
      signal: controller.signal,
    });

    const [, , opts] = mockedFetch.mock.calls[0];
    expect(
      (opts as { signal?: AbortSignal } | undefined)?.signal,
    ).toBe(controller.signal);
  });

  it("falls back to the guest fingerprint header when no JWT is present", async () => {
    mockedFetch.mockResolvedValue({ response: fakeResponse({}), controller: new AbortController() });
    const transport = createMatrxTransport(
      stateOf({ accessToken: null, fingerprintId: "fp-9" }),
    );

    await transport.fetch("/ai/agents/a-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const [, init] = mockedFetch.mock.calls[0];
    expect(init?.headers).toMatchObject({ "X-Fingerprint-ID": "fp-9" });
    expect(
      (init?.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });

  it("applies the v2 prefix to covered AI paths and leaves uncovered paths on v1", async () => {
    mockedFetch.mockResolvedValue({ response: fakeResponse({}), controller: new AbortController() });
    const transport = createMatrxTransport(stateOf({ aiApiVersion: "v2" }));

    await transport.fetch("/ai/agents/a-1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    await transport.fetch("/ai/cancel/r-1", { method: "POST", headers: {} });

    expect(mockedFetch.mock.calls[0][0]).toBe(
      "https://backend.test/v2/ai/agents/a-1",
    );
    expect(mockedFetch.mock.calls[1][0]).toBe(
      "https://backend.test/ai/cancel/r-1",
    );
  });

  it("refuses to send without an organization context (callApi parity)", async () => {
    const transport = createMatrxTransport(stateOf({ organizationId: null }));
    await expect(
      transport.fetch("/ai/agents/a-1", {
        method: "POST",
        headers: {},
        body: "{}",
      }),
    ).rejects.toMatchObject({ code: "organization_context_required" });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  // An Applet job's run carries its own org (withRunOrganization). With no
  // active org it must still reach fetch; with a different active org, the
  // run's org must still win (2026-10-07).
  const RUN_ORG = "33333333-3333-4333-8333-333333333333";

  // These two spy on the GLOBAL fetch: the package's internal resilientFetch
  // is not reached by the @ai-matrx/data/net module mock above.
  function spyGlobalFetch(): jest.SpyInstance {
    return jest
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 200 }));
  }
  function sentOrg(spy: jest.SpyInstance): string | undefined {
    const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
    return new Headers(init?.headers).get("x-organization-id") ?? undefined;
  }

  it("a run's own org reaches fetch when no active org is selected", async () => {
    const spy = spyGlobalFetch();
    try {
      const transport = createMatrxTransport(stateOf({ organizationId: null }));
      await transport.fetch("/runtime/operations/r-1", {
        method: "POST",
        headers: { "X-Organization-Id": RUN_ORG },
        body: "{}",
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(sentOrg(spy)).toBe(RUN_ORG);
    } finally {
      spy.mockRestore();
    }
  });

  it("a run's own org wins over a different active org", async () => {
    const spy = spyGlobalFetch();
    try {
      const transport = createMatrxTransport(stateOf());
      await transport.fetch("/runtime/operations/r-1", {
        method: "POST",
        headers: { "X-Organization-Id": RUN_ORG },
        body: "{}",
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(sentOrg(spy)).toBe(RUN_ORG);
    } finally {
      spy.mockRestore();
    }
  });

  it("feeds non-2xx responses to captureApiError, honoring expectedErrorStatuses", async () => {
    mockedFetch.mockResolvedValue({
      response: fakeResponse({
        ok: false,
        status: 500,
        json: { detail: "boom" },
      }),
      controller: new AbortController(),
    });
    const transport = createMatrxTransport(stateOf());
    await transport.fetch("/ai/agents/a-1", {
      method: "POST",
      headers: {},
      body: "{}",
    });
    expect(mockedCapture).toHaveBeenCalledTimes(1);
    expect(mockedCapture.mock.calls[0][0]).toMatchObject({
      type: "http_error",
      status: 500,
      message: "boom",
    });

    mockedCapture.mockReset();
    mockedFetch.mockResolvedValue({
      response: fakeResponse({ ok: false, status: 404 }),
      controller: new AbortController(),
    });
    const quiet = createMatrxTransport(stateOf(), {
      expectedErrorStatuses: [404],
    });
    await quiet.fetch("/runtime/operations/r-1", {
      method: "GET",
      headers: {},
    });
    expect(mockedCapture).not.toHaveBeenCalled();
  });
});

describe("cancelAgentRunRequest (the moved cancel flow)", () => {
  const dispatch = jest.fn();

  it("POSTs /ai/cancel/{id}?mode=interrupt through the package client and resolves the data envelope", async () => {
    mockedFetch.mockResolvedValue({
      response: fakeResponse({
        json: {
          status: "cancelled",
          request_id: "srv-req-1",
          spine_executions_signalled: [],
        },
      }),
      controller: new AbortController(),
    });

    const result = await cancelAgentRunRequest("srv-req-1", "interrupt")(
      dispatch,
      stateOf(),
      undefined,
    );

    const [url, init] = mockedFetch.mock.calls[0];
    expect(url).toBe("https://backend.test/ai/cancel/srv-req-1?mode=interrupt");
    expect(init?.method).toBe("POST");
    expect(result.data?.request_id).toBe("srv-req-1");
    expect(result.error).toBeUndefined();
  });

  it("carries the page's applied cursor as seen_seq (a Stop saves only what was shown)", async () => {
    mockedFetch.mockResolvedValue({
      response: fakeResponse({
        json: { status: "cancelled", request_id: "srv-req-2", spine_executions_signalled: [] },
      }),
      controller: new AbortController(),
    });

    await cancelAgentRunRequest("srv-req-2", "cancel", 41)(
      dispatch,
      stateOf(),
      undefined,
    );

    expect(mockedFetch.mock.calls[0][0]).toBe(
      "https://backend.test/ai/cancel/srv-req-2?seen_seq=41",
    );
  });

  it("resolves an ApiCallResult error envelope on HTTP failure (never throws)", async () => {
    mockedFetch.mockResolvedValue({
      response: fakeResponse({
        ok: false,
        status: 404,
        json: { detail: { code: "not_found", message: "Unknown request" } },
      }),
      controller: new AbortController(),
    });

    const result = await cancelAgentRunRequest("missing")(
      dispatch,
      stateOf(),
      undefined,
    );

    expect(result.data).toBeUndefined();
    expect(result.error).toMatchObject({
      type: "validation_error",
      status: 404,
      code: "not_found",
    });
  });
});
