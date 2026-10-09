/**
 * A SIGNED-OUT VISITOR'S PAGE NEVER ASKS FOR PRIVATE DATA.
 *
 * Live ops.system_error carried "permission denied for table matrx_action_ledger"
 * and "... table message" from signed-out visitors on /p/<published app>: the chat
 * foot zone read the ledger and stored messages whatever the visitor's identity.
 * Owner rule: reads never error, so the read is not issued without a session.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { combineReducers } from "redux";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import proposedDirectivesReducer from "@ai-matrx/chat/agents/redux/proposed-directives/proposedDirectivesSlice";
import storeReadsReducer from "@/lib/redux/slices/storeReadsSlice";
import userAuthReducer from "@/lib/redux/slices/userAuthSlice";

const tablesAsked: string[] = [];
jest.mock("@/utils/supabase/client", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "is", "order"]) builder[m] = () => builder;
  builder.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(res);
  return {
    supabase: {
      schema: () => ({
        from: (t: string) => {
          tablesAsked.push(t);
          return builder;
        },
      }),
    },
  };
});

import { ProposedDirectivesZone } from "@/features/matrx-envelope/components/ProposedDirectivesZone";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function mount(userId: string | null) {
  const initial = userAuthReducer(undefined, { type: "@@init" });
  const reducer = combineReducers({
      proposedDirectives: proposedDirectivesReducer,
      apiConfig: apiConfigReducer,
      storeReads: storeReadsReducer,
      userAuth: userAuthReducer,
    });
  const store = configureStore({
    reducer,
    preloadedState: { userAuth: { ...initial, id: userId } } as never,
  });
  const host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    createRoot(host).render(
      <Provider store={store}>
        <ProposedDirectivesZone conversationId="22222222-2222-2222-2222-222222222222" />
      </Provider>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("signed-out reads", () => {
  beforeEach(() => {
    tablesAsked.length = 0;
  });
  it("a signed-out render asks for neither the ledger nor the messages", async () => {
    await mount(null);
    expect(tablesAsked).toEqual([]);
  });
  it("control: a signed-in render still reads the ledger", async () => {
    await mount("11111111-1111-1111-1111-111111111111");
    expect(tablesAsked).toContain("matrx_action_ledger");
  });
});
