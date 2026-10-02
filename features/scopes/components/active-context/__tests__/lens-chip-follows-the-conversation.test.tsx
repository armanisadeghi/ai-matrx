/**
 * Guard (W-62, PB-07 S4): the composer's context chip is keyed to the
 * CONVERSATION, not the shell's active organization.
 *
 * After `COM · 1 scope` → shell switch to another organization, the chip read
 * `ASW` while the send still carried the chat's lane scope (the gate's
 * use-chat branch; the server receipt listed "Lane: Port of Oakland lane").
 * Real chip, real store slices, real `setOrganization` cascade; only the scope
 * tree hook, the tags fetch and the picker are stubbed.
 */

import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore, createSlice } from "@reduxjs/toolkit";

import appContext, { setOrganization, setScopeSelections } from "@/lib/redux/slices/appContextSlice";
import conversations, { hydrateConversation } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.slice";

import { ActiveContextLensChip } from "../ActiveContextLensChip";

const COMPASS = "2c1d4319-bf0d-40bc-8ca1-657f4063d080";
const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const LANE_SCOPE = "3df7a3a6-4d1c-4e17-9fc2-27eb9855dcd0";
const CONV = "75ccac71-9ecd-4d99-b610-8f73bff37307";

const organizations = [
  { id: COMPASS, abbreviation: "COM", scope_types: [{ id: "lanes", scopes: [{ id: LANE_SCOPE }] }] },
  { id: WORKSPACE, abbreviation: "ASW", scope_types: [] },
];

let lastSummary = "";
jest.mock("../LensChip", () => {
  const actual = jest.requireActual("../LensChip");
  return {
    ...actual,
    LensChip: ({ nodes }: { nodes: Parameters<typeof actual.summarizeLensSelection>[0] }) => {
      lastSummary = actual.summarizeLensSelection(nodes);
      return <span>{lastSummary}</span>;
    },
  };
});
jest.mock("@/features/scopes/hooks/useScopeTree", () => ({
  useScopeTree: () => ({ organizations }),
}));
jest.mock("../ActiveContextTree", () => ({ ActiveContextTree: () => null }));
jest.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
jest.mock("@/features/scopes/redux/thunks/ensureEntityScopes", () => ({
  entityScopesKey: (t: string, id: string) => `${t}:${id}`,
  ensureEntityScopes: () => ({ type: "test/ensureEntityScopes" }),
}));


const scopesTree = createSlice({
  name: "scopesTree",
  initialState: {
    organizations: {},
    // The chat's durable tag, written by turn 1's syncConversationScopes.
    entityScopesByKey: {
      [`conversation:${CONV}`]: { status: "ready", scope_ids: [LANE_SCOPE] },
    },
  },
  reducers: {},
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("ActiveContextLensChip — keyed to the conversation", () => {
  it("keeps COM · 1 scope after the shell switches organization", () => {
    const store = configureStore({
      reducer: { appContext, conversations, scopesTree: scopesTree.reducer },
      middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
    });
    store.dispatch(setOrganization({ id: COMPASS, name: "Compass" }));
    store.dispatch(setScopeSelections({ [LANE_SCOPE]: LANE_SCOPE }));
    store.dispatch(
      hydrateConversation({ conversationId: CONV, organizationId: COMPASS, status: "ready" }),
    );

    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => {
      root.render(
        <Provider store={store}>
          <ActiveContextLensChip conversationId={CONV} />
        </Provider>,
      );
    });
    expect(lastSummary).toBe("COM · 1 scope");

    // The shell switch: the cascade clears the global scope selection.
    act(() => {
      store.dispatch(setOrganization({ id: WORKSPACE, name: "admin's Workspace" }));
    });
    expect(lastSummary).toBe("COM · 1 scope");

    act(() => root.unmount());
  });

  it("a brand-new chat still follows the shell", () => {
    const store = configureStore({
      reducer: { appContext, conversations, scopesTree: scopesTree.reducer },
      middleware: (gdm) => gdm({ serializableCheck: false, immutableCheck: false }),
    });
    store.dispatch(setOrganization({ id: WORKSPACE, name: "admin's Workspace" }));
    const el = document.createElement("div");
    const root = createRoot(el);
    act(() => {
      root.render(
        <Provider store={store}>
          <ActiveContextLensChip conversationId="new-unsaved" />
        </Provider>,
      );
    });
    expect(lastSummary).toBe("ASW");
    act(() => root.unmount());
  });
});
