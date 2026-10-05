/**
 * A CANCELLED ORGANIZATION QUESTION IS ASKED ONCE (N2).
 *
 * Use case: a person with no organization selected opens the composer's
 * context table and sets "Client" to inline up to 500 characters. Their first
 * rule creates their saved-rules row, which needs an organization, so the
 * "Which organization is this for?" question opens. They press Cancel.
 * Seen live (test@test.com, 2026-10-01): the question re-opened every ~1.5s,
 * twenty times in thirty seconds.
 *
 * SUT: the real context table (package ContextRulesChip, real Inline max
 * field), the real rules thunks and service, the real organization gate and
 * the real OrganizationGateDialog. Doubles: the database and the membership
 * fetch only.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

const PERSON = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
const ORG = "8cb71c8b-5b49-4563-a5fe-d77ff600f8ee";

const inserts: unknown[] = [];
function table() {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  Object.assign(builder, {
    select: self,
    eq: self,
    is: self,
    update: self,
    insert: (row: unknown) => {
      inserts.push(row);
      return builder;
    },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: { id: "r1", version: 1, state: {}, deleted_at: null }, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  });
  return builder;
}
jest.mock("@ai-matrx/chat/host/db", () => ({
  supabase: { schema: () => ({ from: () => table() }) },
}));

// The identity seam (P7) carries the names this test stood in for above; the rest stay real.
jest.mock("@ai-matrx/chat/host/identity", () => {
  const standIns: Record<string, unknown> = {
    ...(() => ({
  requireUserId: () => PERSON,
}))(),
  };
  const moved = ["selectUserId","selectIsAuthenticated","selectIsAdmin","selectIsSuperAdmin","getUserId","requireUserId","NotAuthenticatedError","isNotAuthenticatedError","hasBrowserSession"];
  return {
    ...jest.requireActual("@ai-matrx/chat/host/identity"),
    ...Object.fromEntries(Object.entries(standIns).filter(([name]) => moved.includes(name))),
  };
});

// eslint-disable-next-line no-restricted-syntax -- the real Surface A slice, as the gate dialog's own test uses it
import appContext from "@/lib/redux/slices/appContextSlice";
import userAuth, { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import scopesTree, { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { setStoreSingleton } from "@ai-matrx/chat/store/store-singleton";
import {
  ensureOrganizationContext as askThroughTheAppGate,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";
import { configureChat, _resetChatHostForTests } from "@ai-matrx/chat/host/configure";
import { createFakeDb } from "@ai-matrx/chat/host/__tests__/fake-db";
import { surfaceUserStateReducer } from "@ai-matrx/chat/surfaces/redux/userStateSlice";
import { ContextRulesChip } from "@ai-matrx/agents/context/react";
import { resolveContextRow } from "@ai-matrx/agents/context";
import { OrganizationGateDialog } from "@/features/organizations/gate/OrganizationGateDialog";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { saveContextRule, selectSavedContextRuleRows } from "@ai-matrx/chat/agents/redux/execution-system/context-rules/context-rules.thunks";

function Table() {
  const dispatch = useAppDispatch();
  const saved = useAppSelector(selectSavedContextRuleRows);
  const row = resolveContextRow(
    {
      key: "client",
      label: "Client",
      origin: "system",
      value: { browser: "Chrome", platform: "macOS", timezone: "America/Los_Angeles" },
    },
    saved,
  );
  return (
    <ContextRulesChip
      label="Context"
      rows={[row]}
      cap={50000}
      open
      onOpenChange={() => {}}
      onChange={(key, surfaceKey, next) =>
        void dispatch(
          saveContextRule({
            surfaceKey,
            key,
            rule: next === null ? null : { include: next.include, max_inline_chars: next.max_inline_chars },
          }),
        ).catch(() => {})
      }
      onResetAll={() => {}}
      onOpenFullView={() => {}}
    />
  );
}

let root: Root;
let container: HTMLDivElement;
let opens = 0;
let observer: MutationObserver;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  inserts.length = 0;
  opens = 0;
  const store = configureStore({
    reducer: { appContext, userAuth, scopesTree, surfaceUserState: surfaceUserStateReducer },
  });
  setStoreSingleton(store);
  // The package asks for an organization through its host's org port; this app's port is its
  // one gate (providers/ChatHostAdapter.tsx). This test drives the explicit ask a save makes.
  configureChat({
    db: createFakeDb().db,
    org: {
      active: () => null,
      subscribe: () => () => undefined,
      require: (_reason, options) =>
        askThroughTheAppGate({ interactive: options?.interactive ?? true }),
    },
  });
  store.dispatch(setUserAuth({ id: PERSON }));
  store.dispatch(
    scopesActions.treeFetchFulfilled({
      organizations: [
        { id: ORG, name: "Pierce County Tenant Legal Aid", abbreviation: "PCTLA", slug: "pctla", role: "owner", scope_types: [], projects: [] },
      ],
      fetched_at: "2026-10-01T07:00:00Z",
    }),
  );
  observer = new MutationObserver(() => {
    const dialog = document.querySelector('[data-organization-gate][data-state="open"]');
    const marked = dialog?.getAttribute("data-counted");
    if (dialog && !marked) {
      dialog.setAttribute("data-counted", "1");
      opens += 1;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <OrganizationGateDialog />
        <Table />
      </Provider>,
    );
  });
});

afterEach(async () => {
  observer.disconnect();
  await act(async () => {
    settleOrganizationSelection(null);
    root.unmount();
  });
  container.remove();
  _resetChatHostForTests();
});

const wait = (ms: number) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

it("Cancel on the organization question asks once, writes nothing, and never re-asks", async () => {
  const field = document.querySelector<HTMLInputElement>('input[aria-label="Inline max for Client"]')!;
  await act(async () => {
    field.focus();
  });
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(field, "500");
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await wait(200);
  expect(opens).toBe(1);

  const cancel = [...document.querySelectorAll<HTMLButtonElement>("[data-organization-gate] button")].find(
    (b) => b.textContent?.trim() === "Cancel",
  )!;
  await act(async () => {
    cancel.click();
  });
  await wait(3000);

  expect(opens).toBe(1);
  expect(inserts).toEqual([]);
}, 10000);
