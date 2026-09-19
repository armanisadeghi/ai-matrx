/**
 * The panel's chosen browser has to REACH the agent.
 *
 * What these lock down is not "a hook dispatches": it is that picking a
 * browser in the panel lands in the conversation's `instanceContext` as the
 * one `cloud_browser_profile` entry, that re-rendering with the same profile
 * does NOT keep re-dispatching, and that switching browsers REPLACES the entry
 * rather than leaving the old browser's id behind for the agent to act on.
 *
 * The real action creators and the real reducer run here — the assertions are
 * over the resulting slice state, not over a spy's call shape.
 */

import * as React from "react";
import { configureStore } from "@reduxjs/toolkit";
import { renderHook } from "@/test-utils/renderHook";

const dispatched: Array<{ type: string; payload?: unknown }> = [];
const mockDispatch = (action: { type: string; payload?: unknown }) => {
  dispatched.push(action);
  return action;
};

jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => mockDispatch,
}));

import instanceContextReducer from "@/features/agents/redux/execution-system/instance-context/instance-context.slice";
import {
  CLOUD_BROWSER_PROFILE_CONTEXT_KEY,
  useCloudBrowserProfileContextSync,
} from "./useCloudBrowserProfileContextSync";

const CONV = "conv-1";

/** Replay everything the hook dispatched through the REAL reducer. */
function contextFor(conversationId: string) {
  const store = configureStore({
    reducer: { instanceContext: instanceContextReducer },
  });
  for (const action of dispatched) store.dispatch(action);
  return store.getState().instanceContext.byConversationId[conversationId] ?? {};
}

beforeEach(() => {
  dispatched.length = 0;
});

test("publishes one json entry naming the chosen browser", async () => {
  const handle = await renderHook(() =>
    useCloudBrowserProfileContextSync(CONV, {
      id: "prof-a",
      displayName: "Shopping",
    }),
  );

  expect(dispatched).toHaveLength(1);
  expect(contextFor(CONV)[CLOUD_BROWSER_PROFILE_CONTEXT_KEY]).toEqual({
    key: CLOUD_BROWSER_PROFILE_CONTEXT_KEY,
    value: { profile_id: "prof-a", display_name: "Shopping" },
    type: "json",
    slotMatched: false,
    label: "Cloud Browser",
  });

  await handle.unmount();
});

type Profile = { id: string; displayName: string } | null;

/**
 * Render the hook behind React state so a test can change the profile the way
 * the panel does — a real re-render, not a mutated closure.
 */
async function renderWithProfile(initial: Profile, conversationId = CONV) {
  let setProfile!: (next: Profile) => void;
  const handle = await renderHook(() => {
    const [profile, set] = React.useState<Profile>(initial);
    setProfile = set;
    useCloudBrowserProfileContextSync(conversationId, profile);
  });
  return {
    handle,
    async set(next: Profile) {
      await handle.act(async () => {
        setProfile(next);
      });
    },
  };
}

test("an unchanged profile never re-dispatches", async () => {
  const { handle, set } = await renderWithProfile({
    id: "prof-a",
    displayName: "Shopping",
  });
  // Equal-but-new objects, the way a fresh selector result arrives.
  await set({ id: "prof-a", displayName: "Shopping" });
  await set({ id: "prof-a", displayName: "Shopping" });

  expect(dispatched).toHaveLength(1);
  await handle.unmount();
});

test("switching browsers replaces the entry, never stacks a stale id", async () => {
  const { handle, set } = await renderWithProfile({
    id: "prof-a",
    displayName: "Shopping",
  });

  await set({ id: "prof-b", displayName: "Banking" });

  expect(dispatched).toHaveLength(2);
  const context = contextFor(CONV);
  expect(Object.keys(context)).toEqual([CLOUD_BROWSER_PROFILE_CONTEXT_KEY]);
  expect(context[CLOUD_BROWSER_PROFILE_CONTEXT_KEY].value).toEqual({
    profile_id: "prof-b",
    display_name: "Banking",
  });

  await handle.unmount();
});

test("losing the profile clears the entry instead of leaving it stale", async () => {
  const { handle, set } = await renderWithProfile({
    id: "prof-a",
    displayName: "Shopping",
  });

  await set(null);

  expect(contextFor(CONV)[CLOUD_BROWSER_PROFILE_CONTEXT_KEY]).toBeUndefined();
  await handle.unmount();
});

test("no conversation means nothing is published", async () => {
  const handle = await renderHook(() =>
    useCloudBrowserProfileContextSync(undefined, {
      id: "prof-a",
      displayName: "Shopping",
    }),
  );

  expect(dispatched).toHaveLength(0);
  await handle.unmount();
});
