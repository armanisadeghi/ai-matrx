import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
// eslint-disable-next-line no-restricted-syntax -- Exercise the real Surface A organization selection in this regression.
import appContext, {
  setOrganization,
  setConversation,
} from "@/lib/redux/slices/appContextSlice";
import userAuth, { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import scopesTree, { scopesActions } from "@/features/scopes/redux/scopesSlice";
import { setStoreSingleton } from "@/lib/redux/store-singleton";
import {
  ensureOrganizationContext,
  settleOrganizationSelection,
} from "@/lib/organization/organization-gate";
import { scopesService } from "@/features/scopes/service/scopesService";
import { OrganizationGateDialog } from "./OrganizationGateDialog";

// External I/O only. The gate, hooks, selectors, reducers and promise bridge are real.
jest.mock("@/features/organizations/service", () => ({
  getUserOrganizations: () => new Promise(() => {}),
}));
jest.mock("@/features/scopes/service/scopesService", () => ({
  scopesService: { getScopeTree: jest.fn() },
}));

const ORG = "f9cb3e35-2a65-4f2a-8525-088d6551071c";
let root: Root;
let container: HTMLDivElement;
let store: ReturnType<typeof createStore>;
function createStore() {
  return configureStore({ reducer: { appContext, userAuth, scopesTree } });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  store = createStore();
  setStoreSingleton(store);
  store.dispatch(setUserAuth({ id: "signed-in-user" }));
  store.dispatch(
    scopesActions.treeFetchFulfilled({
      organizations: [
        {
          id: ORG,
          name: "Team workspace",
          abbreviation: "TEAM",
          slug: "team",
          // CONVERGE: C-3 — is_personal is dropped; the default organization becomes users default_organization_id preference — declared 2026-09-10, Data Doctrine R9–R12. Register: /projects/data-doctrine-adoption/REGISTER.md#DD-045
          is_personal: false,
          role: "owner",
          scope_types: [],
          projects: [],
        },
      ],
      fetched_at: "2026-09-11T04:00:00Z",
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <Provider store={store}>
        <OrganizationGateDialog />
      </Provider>,
    );
  });
});
afterEach(async () => {
  await act(async () => {
    settleOrganizationSelection(null);
    root.unmount();
  });
  container.remove();
});

it("resumes the pending send when the selected organization arrives after the dialog opens", async () => {
  let resumedWith: string | null = null;
  await act(async () => {
    void ensureOrganizationContext().then(
      (id) => {
        resumedWith = id;
      },
      () => {},
    );
  });
  await act(async () => {
    store.dispatch(setOrganization({ id: ORG, name: "Team workspace" }));
  });
  expect(resumedWith).toBe(ORG);
  expect(document.body.textContent).not.toContain(
    "Which workspace is this for?",
  );
});

it("offers the header's cached organizations even while the browser token is absent", async () => {
  await act(async () => {
    void ensureOrganizationContext().catch(() => {});
  });
  expect(document.body.textContent).toContain("Team workspace");
  expect(document.body.textContent).not.toContain("Loading your organizations");
});

it("cancels a pending send without resuming it on a later organization change", async () => {
  let outcome = "pending";
  await act(async () => {
    void ensureOrganizationContext().then(
      () => {
        outcome = "sent";
      },
      (error: Error) => {
        outcome = error.name;
      },
    );
  });
  const cancel = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Cancel",
  );
  await act(async () => {
    cancel?.click();
  });
  await act(async () => {
    store.dispatch(setOrganization({ id: ORG, name: "Team workspace" }));
  });
  expect(outcome).toBe("OrganizationSelectionCancelled");
});

it("continues in the chosen workspace without clearing the pending conversation", async () => {
  store.dispatch(setConversation("pending-conversation"));
  let resumedWith: string | null = null;
  await act(async () => {
    void ensureOrganizationContext().then(
      (id) => {
        resumedWith = id;
      },
      () => {},
    );
  });
  const option = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Team workspace",
  );
  await act(async () => {
    option?.click();
  });
  const confirm = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Continue",
  );
  await act(async () => {
    confirm?.click();
  });
  expect(resumedWith).toBe(ORG);
  expect(store.getState().appContext.conversation_id).toBe(
    "pending-conversation",
  );
});

it("retries a failed membership read in place and offers the returned workspace", async () => {
  await act(async () => {
    await act(async () => {
      store.dispatch(scopesActions.scopesReset());
    });
  });
  const getTree = jest.mocked(scopesService.getScopeTree);
  getTree.mockResolvedValueOnce({
    ok: false,
    error: { code: "internal", message: "Connection interrupted" },
  });
  await act(async () => {
    void ensureOrganizationContext().catch(() => {});
  });
  expect(document.body.textContent).toContain("Connection interrupted");
  getTree.mockResolvedValueOnce({
    ok: true,
    data: {
      organizations: [
        {
          id: ORG,
          name: "Recovered team",
          abbreviation: "REC",
          slug: "recovered",
          is_personal: false,
          role: "owner",
          scope_types: [],
          projects: [],
        },
      ],
      fetched_at: "2026-09-11T04:00:00Z",
    },
  });
  const retry = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Try again",
  );
  await act(async () => {
    retry?.click();
  });
  expect(document.body.textContent).toContain("Recovered team");
  expect(document.body.textContent).not.toContain("Connection interrupted");
});

describe("workspaceChoices (review 2026-09-25)", () => {
  // Imported lazily so the module mocks above apply.
  const { workspaceChoices } = jest.requireActual("./OrganizationGateDialog") as typeof import("./OrganizationGateDialog");
  const row = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    name,
    is_personal: false,
    ...extra,
  });

  it("never offers another person's personal workspace; offers your own", () => {
    const choices = workspaceChoices([
      row("a", "admin's Workspace", { is_personal: true, role: "member" }),
      row("b", "Alex Hart's Workspace", { is_personal: true, role: "owner" }),
      row("c", "Ashford Labs", { role: "member" }),
    ]);
    expect(choices.map((c) => c.id)).toEqual(["b", "c"]);
  });

  it("tells two workspaces with the same name apart, and lists one id once", () => {
    const choices = workspaceChoices([
      row("r1", "Rincon Plumbing Co", { slug: "rincon-plumbing-co", role: "member" }),
      row("r2", "Rincon Plumbing Co", { slug: "rincon-plumbing-share-green", role: "member" }),
      row("r2", "Rincon Plumbing Co", { slug: "rincon-plumbing-share-green", role: "member" }),
      row("o", "Oak & River", { slug: "oak-and-river", role: "member" }),
    ]);
    expect(choices.map((c) => [c.id, c.detail])).toEqual([
      ["r1", "rincon-plumbing-co"],
      ["r2", "rincon-plumbing-share-green"],
      ["o", null],
    ]);
  });
});
