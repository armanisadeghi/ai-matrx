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

  it("does not let a personal organization fallback reach the network", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const state = requestState(null, ORGANIZATION_ID);

    const result = await callApi({
      path: "/health",
      method: "GET",
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), () => state, undefined);

    expect(result.error).toMatchObject({
      type: "validation_error",
      code: "organization_context_required",
    });
    expect(fetchMock).not.toHaveBeenCalled();
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
});
