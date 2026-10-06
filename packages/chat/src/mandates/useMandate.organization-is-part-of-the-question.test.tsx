/**
 * THE ORGANIZATION IS PART OF THE QUESTION — `useMandate` re-asks on its own
 * when the selected organization arrives.
 *
 * Seat (2026-10-04, /notes and /education): signed in with no organization,
 * the page assistant said "An organization is needed for the page assistant".
 * Choose organization → Ashford Labs closed the list, but the notice stayed and
 * the assistant never loaded; Try again did nothing either. `useMandate` keyed
 * its answer on the mandate key alone and learned about the new organization
 * only through a side channel — a store middleware that drops the module cache
 * and notifies listeners. When that notice does not reach the mounted hook
 * (a store without the middleware, a hot-reloaded service module whose
 * listener set is not the one the middleware calls), `organizationPending`
 * latched for good. `useMandateHolder` already re-asks on the selected
 * organization; this is the same contract for `useMandate` and `useMandateSet`.
 *
 * The invalidation side channel is deliberately a no-op here: the hook must
 * recover from the organization alone.
 */
import * as React from "react";
import { Provider } from "react-redux";
import { configureStore, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { renderHook } from "@ai-matrx/chat/testing/render-hook";

class MandateOrganizationUnresolvedError extends Error {}

let selectedOrganization: string | null = null;
const resolveMandate = jest.fn(async (key: string) => {
  if (!selectedOrganization) throw new MandateOrganizationUnresolvedError(key);
  return { mandateKey: key, agentId: "agent-1", organizationId: selectedOrganization };
});

jest.mock("./service", () => ({
  MandateOrganizationUnresolvedError,
  resolveMandate: (key: string) => resolveMandate(key),
  // The side channel never fires: recovery must not depend on it.
  onMandateCacheInvalidated: () => () => {},
}));

// eslint-disable-next-line import/first
import { useMandate } from "./useMandate";
// eslint-disable-next-line import/first
import { useMandateSet } from "./useMandateSet";
// eslint-disable-next-line import/first
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";

const KEY = MANDATE_KEYS.messaging__conversation_catch_up;

const chatHost = createSlice({
  name: "chatHost",
  initialState: { org: null as { id: string; name: string } | null },
  reducers: {
    setOrg: (state, action: PayloadAction<{ id: string; name: string } | null>) => {
      state.org = action.payload;
    },
  },
});

function makeStore() {
  return configureStore({ reducer: { chatHost: chatHost.reducer } });
}

async function flush() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("useMandate — the organization is part of the question", () => {
  beforeEach(() => {
    selectedOrganization = null;
    resolveMandate.mockClear();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("leaves organizationPending and resolves once an organization is chosen", async () => {
    const store = makeStore();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const hook = await renderHook(() => useMandate(KEY), { wrapper });
    await hook.act(flush);
    expect(hook.current.organizationPending).toBe(true);
    expect(hook.current.mandate).toBeNull();

    // The chooser: the host's selection lands, and nothing else happens.
    await hook.act(async () => {
      selectedOrganization = "org-ashford";
      store.dispatch(chatHost.actions.setOrg({ id: "org-ashford", name: "Ashford Labs" }));
      await flush();
    });

    expect(hook.current.organizationPending).toBe(false);
    expect(hook.current.error).toBeNull();
    expect(hook.current.mandate?.agentId).toBe("agent-1");
    await hook.unmount();
  });

  it("useMandateSet re-asks every key when an organization is chosen", async () => {
    const store = makeStore();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const hook = await renderHook(() => useMandateSet([KEY]), { wrapper });
    await hook.act(flush);
    expect(hook.current[KEY]?.mandate).toBeNull();

    await hook.act(async () => {
      selectedOrganization = "org-ashford";
      store.dispatch(chatHost.actions.setOrg({ id: "org-ashford", name: "Ashford Labs" }));
      await flush();
    });

    expect(hook.current[KEY]?.mandate?.agentId).toBe("agent-1");
    await hook.unmount();
  });
});
