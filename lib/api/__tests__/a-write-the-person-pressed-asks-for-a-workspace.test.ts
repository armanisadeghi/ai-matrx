/**
 * 🚨 A WRITE THE PERSON PRESSED ASKS FOR A WORKSPACE (2026-09-26).
 *
 * MEASURED: with no workspace selected, Duplicate conversation (and every other
 * write through callApi) answered "Select an organization before sending this
 * request." — a refusal with no remedy. callApi had been made non-interactive
 * (4821555e98) because background calls reach it too; reads have since stopped
 * needing an organization at all, and the browser's transient user activation
 * tells a pressed write from a background one.
 *
 * WHAT THIS PINS, for a write with nothing selected:
 *   1. the person just acted → the ONE picker opens, the call waits, and it is
 *      SENT with the chosen organization;
 *   2. the person dismisses the picker → nothing is sent, and the result is the
 *      quiet "organization_selection_cancelled" (never a refusal toast);
 *   3. no recent activation (a background write) → the fail-closed refusal,
 *      and NO dialog;
 *   4. a read never asks; `interactiveOrganization: false` opts a write out.
 */

import { callApi } from "../call-api";
import {
  registerOrganizationPicker,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";
import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import appContextReducer from "@/lib/redux/slices/appContextSlice";
import userAuthReducer, { setAuthReady } from "@/lib/redux/slices/userAuthSlice";
import userProfileReducer from "@/lib/redux/slices/userProfileSlice";
import type { RootState } from "@/lib/redux/store";

const CHOSEN = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

function noOrganizationState(): RootState {
  return {
    apiConfig: apiConfigReducer(undefined, { type: "test/init" }),
    appContext: { ...appContextReducer(undefined, { type: "test/init" }), organization_id: null },
    userAuth: userAuthReducer(userAuthReducer(undefined, { type: "test/init" }), setAuthReady(true)),
    userProfile: userProfileReducer(undefined, { type: "test/init" }),
  } as unknown as RootState;
}

function setActivation(isActive: boolean | undefined) {
  Object.defineProperty(globalThis.navigator, "userActivation", {
    configurable: true,
    value: isActive === undefined ? undefined : { isActive, hasBeenActive: isActive },
  });
}

const okResponse = () =>
  ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: async () => ({ conversation_id: "copy-1" }),
  }) as Response;

function write(extra: Record<string, unknown> = {}) {
  return callApi({
    path: "/cx/conversations/{conversation_id}/fork",
    method: "POST",
    pathParams: { conversation_id: "conv-1" },
    body: { title: "Copy" },
    stream: false,
    _testOverrides: { forceBaseUrl: "https://server.test" },
    ...extra,
  } as Parameters<typeof callApi>[0])(jest.fn(), noOrganizationState, undefined);
}

describe("a write with no workspace selected", () => {
  const originalFetch = global.fetch;
  let opened = 0;
  let answer: string | null = CHOSEN;

  beforeEach(() => {
    opened = 0;
    answer = CHOSEN;
    registerOrganizationPicker(() => {
      opened += 1;
      queueMicrotask(() => settleOrganizationSelection(answer));
    });
  });
  afterEach(() => {
    registerOrganizationPicker(null);
    global.fetch = originalFetch;
    setActivation(undefined);
  });

  it("the person just pressed it: asks once, waits, and sends with the chosen workspace", async () => {
    setActivation(true);
    const fetchMock = jest.fn().mockResolvedValue(okResponse());
    global.fetch = fetchMock;
    const result = await write();
    expect(opened).toBe(1);
    expect(result.error).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["X-Organization-Id"]).toBe(CHOSEN);
  });

  it("dismissing the picker sends nothing and says nothing", async () => {
    setActivation(true);
    answer = null;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const result = await write();
    expect(opened).toBe(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.error).toMatchObject({ code: "organization_selection_cancelled", message: "" });
  });

  it("a background write (no recent activation) keeps the refusal and never opens a dialog", async () => {
    setActivation(false);
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const result = await write();
    expect(opened).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.error).toMatchObject({ code: "organization_context_required" });
  });

  it("an explicit opt-out keeps a write non-interactive even right after a click", async () => {
    setActivation(true);
    global.fetch = jest.fn();
    const result = await write({ interactiveOrganization: false });
    expect(opened).toBe(0);
    expect(result.error).toMatchObject({ code: "organization_context_required" });
  });

  it("a read never asks", async () => {
    setActivation(true);
    global.fetch = jest.fn().mockResolvedValue(okResponse());
    const result = await callApi({
      path: "/health",
      method: "GET",
      _testOverrides: { forceBaseUrl: "https://server.test" },
    })(jest.fn(), noOrganizationState, undefined);
    expect(opened).toBe(0);
    expect(result.error).toBeUndefined();
  });
});
