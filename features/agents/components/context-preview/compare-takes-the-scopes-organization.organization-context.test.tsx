/**
 * ORG-GATE-AUDIT (VERIFIER-20 #2). The owner's compare link
 * (/administration/scopes-context/context-inspector?scope=<id>) opened on
 * "Select an organization before sending this request": the compare rode the
 * SHELL's active organization, and the page's own Organization field did
 * nothing. The page now reads the scope's organization from the scope id and
 * hands it in; this proves the preview SENDS that organization as the
 * request's, whatever (or nothing) is selected in the shell.
 * Fails against the pre-fix hook, which ignored any organization it was given.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";

jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (thunk: unknown) => thunk,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(undefined),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectScopeSelectionsContext: () => ({}),
}));
jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.selectors",
  () => ({ selectConversationScopeIds: () => () => ({ organizationId: undefined }) }),
);

import { callApi } from "@/lib/api/call-api";
import { useContextPreview } from "./useContextPreview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const door = callApi as unknown as jest.Mock;
const SCOPE_ID = "a55cb71e-2afb-4825-9570-a2c1c6ba02b8";
const SCOPES_ORGANIZATION = "884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f";

it("sends the compared scope's own organization as the request's organization", async () => {
  door.mockReturnValue(Promise.resolve({ data: { compare: null } }));
  function Probe() {
    useContextPreview({
      enabled: true,
      path: "both",
      scopeIds: [SCOPE_ID],
      organizationId: SCOPES_ORGANIZATION,
    });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Probe />));

  expect(door).toHaveBeenCalled();
  const request = door.mock.calls[0][0] as {
    body: { scope_ids: string[] };
    scopeOverrides?: { organization_id?: string };
  };
  expect(request.body.scope_ids).toEqual([SCOPE_ID]);
  expect(request.scopeOverrides).toEqual({ organization_id: SCOPES_ORGANIZATION });
  await act(async () => root.unmount());
});
