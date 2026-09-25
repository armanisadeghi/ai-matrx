import {
  applyOrganizationContextHeader,
  assertQueryOrganizationMatchesContext,
  buildRequestBody,
  callApi,
  OrganizationContextError,
  requireOrganizationContext,
  type ResolvedCallScope,
} from "../call-api";
import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import userAuthReducer, {
  setAuthReady,
} from "@/lib/redux/slices/userAuthSlice";
import userProfileReducer from "@/lib/redux/slices/userProfileSlice";
import type { RootState } from "@/lib/redux/store";
import {
  clearCapturedErrors,
  getSnapshot,
} from "@/lib/diagnostics/errorCaptureStore";

const ORGANIZATION_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";
const OTHER_ORGANIZATION_ID = "39c38960-d30c-4840-b0c1-c9960de95582";

const scope: ResolvedCallScope = {
  organization_id: ORGANIZATION_ID,
};

function requestState(
  organizationId: string | null,
  personalOrganizationId: string | null,
): RootState {
  const appContext = {
    ...appContextReducer(undefined, { type: "test/init" }),
    organization_id: organizationId,
    personal_organization_id: personalOrganizationId,
  };
  const userAuth = userAuthReducer(
    userAuthReducer(undefined, { type: "test/init" }),
    setAuthReady(true),
  );

  return {
    apiConfig: apiConfigReducer(undefined, { type: "test/init" }),
    appContext,
    userAuth,
    userProfile: userProfileReducer(undefined, { type: "test/init" }),
  } as unknown as RootState;
}

describe("callApi organization context", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    clearCapturedErrors();
  });

  it("refuses to resolve a request without an explicitly selected or supplied organization", () => {
    expect(() => requireOrganizationContext(null)).toThrow(
      OrganizationContextError,
    );
    expect(() => requireOrganizationContext(undefined, "   ")).toThrow(
      "Select an organization before sending this request.",
    );
  });

  it("allows an explicit entity organization override and normalizes whitespace", () => {
    expect(requireOrganizationContext(null, ` ${ORGANIZATION_ID} `)).toBe(
      ORGANIZATION_ID,
    );
  });

  it("rejects a non-UUID organization before networking", () => {
    expect(() => requireOrganizationContext("personal-default")).toThrow(
      "The selected organization ID is invalid.",
    );
  });

  it("injects the required organization into the request body", () => {
    expect(buildRequestBody({ user_input: "hello" }, scope)).toEqual({
      organization_id: ORGANIZATION_ID,
      user_input: "hello",
    });
  });

  it("rejects a body organization that disagrees with request context", () => {
    expect(() =>
      buildRequestBody(
        { organization_id: OTHER_ORGANIZATION_ID, user_input: "hello" },
        scope,
      ),
    ).toThrow("must match the request context organization");
  });

  // GUARD — the Libraries paste box, 2026-09-17. `createLibrary` wrote
  // `organization_id: input.organizationId ?? null`, which is the ordinary way
  // a caller says "I am naming no organization here". This threw
  // "Request body organization_id must match the request context organization"
  // and blocked every new channel intake. A null names no organization, so it
  // can never disagree with one.
  it("treats a null body organization as absence and injects the context one", () => {
    expect(
      buildRequestBody({ organization_id: null, input: "@mkbhd" }, scope),
    ).toEqual({ organization_id: ORGANIZATION_ID, input: "@mkbhd" });
  });

  it("treats a blank body organization as absence too", () => {
    expect(
      buildRequestBody({ organization_id: "   ", input: "@mkbhd" }, scope),
    ).toEqual({ organization_id: ORGANIZATION_ID, input: "@mkbhd" });
  });

  it("still refuses a body organization that names a different organization", () => {
    expect(() =>
      buildRequestBody({ organization_id: OTHER_ORGANIZATION_ID }, scope),
    ).toThrow("must match the request context organization");
  });

  it("sends the same organization in the canonical middleware header", () => {
    expect(
      applyOrganizationContextHeader(
        { Authorization: "Bearer redacted" },
        ORGANIZATION_ID,
      ),
    ).toEqual({
      Authorization: "Bearer redacted",
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  it("rejects a conflicting organization header instead of overriding it", () => {
    expect(() =>
      applyOrganizationContextHeader(
        { "x-organization-id": OTHER_ORGANIZATION_ID },
        ORGANIZATION_ID,
      ),
    ).toThrow("must match the request context organization");
  });

  it("canonicalizes equivalent header casing without sending duplicates", () => {
    expect(
      applyOrganizationContextHeader(
        { "x-organization-id": ORGANIZATION_ID },
        ORGANIZATION_ID,
      ),
    ).toEqual({ "X-Organization-Id": ORGANIZATION_ID });
  });

  it("rejects query context disagreement before networking", () => {
    expect(() =>
      assertQueryOrganizationMatchesContext(
        { organization_id: OTHER_ORGANIZATION_ID },
        ORGANIZATION_ID,
      ),
    ).toThrow("must match the request context organization");
  });

  it("does not let a personal organization fallback reach the network (a write is refused)", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const state = requestState(null, ORGANIZATION_ID);

    const result = await callApi({
      path: "/ai/agents/{agent_id}",
      method: "POST",
      pathParams: { agent_id: "agent-test" },
      body: { user_input: "hello" },
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toMatchObject({
      type: "validation_error",
      code: "organization_context_required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // THE PERSON, NOT THE ORG (Arman, 2026-09-23). "No organization selected" is
  // never an error for a READ: a GET with nothing selected goes out WITHOUT an
  // organization — and still never borrows the personal one — so the server's
  // read door decides whether this item opens.
  it("sends a READ with no organization selected, naming none (and never the personal one)", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: async () => ({ status: "healthy" }),
    } as Response);
    global.fetch = fetchMock;
    const state = requestState(null, ORGANIZATION_ID);

    const result = await callApi({
      path: "/health",
      method: "GET",
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["X-Organization-Id"]).toBeUndefined();
    expect(String(url)).not.toContain(ORGANIZATION_ID);
  });

  // A POST that is a READ on an organization-free admin route (the mandate
  // grade reads) opts in with `organizationFreeRead` and is treated like a GET.
  // Without the flag the same POST is refused (the write test above).
  it("sends an organizationFreeRead POST with no organization selected, naming none", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: async () => ({ verdicts: [] }),
    } as Response);
    global.fetch = fetchMock;
    const state = requestState(null, ORGANIZATION_ID);

    const result = await callApi({
      path: "/mandates/impact/workflows",
      method: "POST",
      body: { workflow_ids: null },
      organizationFreeRead: true,
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers["X-Organization-Id"]).toBeUndefined();
    expect(String(init.body)).not.toContain("organization_id");
  });

  it("CONTROL: a READ with an organization selected still names it", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: async () => ({ status: "healthy" }),
    } as Response);
    global.fetch = fetchMock;
    const state = requestState(OTHER_ORGANIZATION_ID, ORGANIZATION_ID);

    const result = await callApi({
      path: "/health",
      method: "GET",
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Organization-Id"]).toBe(OTHER_ORGANIZATION_ID);
  });

  it("does not start a stream without explicit organization context", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const state = requestState(null, ORGANIZATION_ID);

    const result = await callApi({
      path: "/seo/sites/{site_id}/analytics/sync",
      method: "POST",
      pathParams: { site_id: "site-test" },
      body: { window_days: 28 },
      stream: true,
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toMatchObject({
      type: "validation_error",
      code: "organization_context_required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("admits the fingerprint guest lane WITHOUT an organization (corrected contract)", async () => {
    // The server's AuthMiddleware admits the fingerprint lane org-less
    // (matrx-connect 241750bf6): a guest has no membership to verify, so
    // callApi must neither refuse nor stamp X-Organization-Id nor inject
    // organization_id into the body — and must never open the org picker.
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: async () => ({ status: "healthy" }),
    } as Response);
    global.fetch = fetchMock;
    const base = requestState(null, null);
    const state = {
      ...base,
      userProfile: {
        ...(base as unknown as { userProfile: Record<string, unknown> })
          .userProfile,
        fingerprintId: "fp-guest-test",
      },
    } as unknown as RootState;

    const result = await callApi({
      path: "/ai/agents/{agent_id}",
      method: "POST",
      pathParams: { agent_id: "agent-test" },
      body: { user_input: "hello" },
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Fingerprint-ID"]).toBe("fp-guest-test");
    expect(headers["X-Organization-Id"]).toBeUndefined();
    expect(JSON.parse(String(init.body))).toEqual({ user_input: "hello" });
  });

  it("still binds an explicitly resolved organization on the guest lane", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: async () => ({ status: "healthy" }),
    } as Response);
    global.fetch = fetchMock;
    const base = requestState(null, null);
    const state = {
      ...base,
      userProfile: {
        ...(base as unknown as { userProfile: Record<string, unknown> })
          .userProfile,
        fingerprintId: "fp-guest-test",
      },
    } as unknown as RootState;

    const result = await callApi({
      path: "/ai/agents/{agent_id}",
      method: "POST",
      pathParams: { agent_id: "agent-test" },
      body: { user_input: "hello" },
      scopeOverrides: { organization_id: ORGANIZATION_ID },
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toBeUndefined();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "X-Organization-Id": ORGANIZATION_ID,
    });
  });

  it("binds the selected organization into the real fetch body and header", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: async () => ({ status: "healthy" }),
    } as Response);
    global.fetch = fetchMock;
    const state = requestState(ORGANIZATION_ID, OTHER_ORGANIZATION_ID);

    const result = await callApi({
      path: "/ai/agents/{agent_id}",
      method: "POST",
      pathParams: { agent_id: "agent-test" },
      body: {
        organization_id: ORGANIZATION_ID,
        store: true,
        conversation_id: "conversation-test",
        is_new: true,
        user_input: "hello",
      },
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      "X-Organization-Id": ORGANIZATION_ID,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      organization_id: ORGANIZATION_ID,
      store: true,
      conversation_id: "conversation-test",
      is_new: true,
      user_input: "hello",
    });
  });

  it.each([false, true])(
    "correlates a failed %s request with its response request id",
    async (stream) => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers({ "X-Request-ID": "fork-request-1" }),
        json: async () => ({ message: "Failed to create forked conversation." }),
      } as Response);
    const state = requestState(ORGANIZATION_ID, null);

    const result = await callApi({
      path: "/ai/agents/{agent_id}",
      method: "POST",
      pathParams: { agent_id: "agent-test" },
      body: { user_input: "hello" },
      stream,
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toMatchObject({ status: 500 });
    expect(getSnapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relation: "POST /ai/agents/{agent_id}",
          requestId: "fork-request-1",
        }),
      ]),
    );
    },
  );
});
