/**
 * V-19 — THE APPROVE CARD MUST ANSWER, NOT VANISH.
 *
 * Found on production, 2026-09-12: the org gate makes `ask` the normal outcome,
 * so this card IS the flow a person walks. Approve POSTed, the card was removed,
 * and the only thing left was a four-second toast the client composed from
 * counts — `Applied ${title}: ${result.applied} done` — the exact
 * client-composed-from-counts line DD-118 exists to kill. The project was
 * written and the chat said nothing.
 *
 * Pinned here: after Approve the card stays and states the SERVER's sentence,
 * and a deduped re-approve says so instead of reading like a fresh write.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import proposedDirectivesReducer, {
  proposeDirective,
  removeProposal,
  resolveProposal,
} from "@/features/matrx-envelope/state/proposedDirectivesSlice";
import { ProposedDirectivesZone } from "@/features/matrx-envelope/components/ProposedDirectivesZone";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION = "11111111-1111-1111-1111-111111111111";
const SLUG = "directive_v1_action_create_project_with_tasks";

/** Exactly what aidream's receipt_words.py produces for this item. */
const PROPOSED = "Proposed — confirm to run 1 create project with tasks.";
const APPLIED = "Created project “V-19 Receipt Check” with 2 task(s).";
const ALREADY =
  "Already applied — nothing new was created. Originally: Created project “V-19 Receipt Check” with 2 task(s).";

function makeStore() {
  return configureStore({
    reducer: {
      proposedDirectives: proposedDirectivesReducer,
      apiConfig: apiConfigReducer,
    },
  });
}

function mount(store: ReturnType<typeof makeStore>) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  let root: Root | null = null;
  act(() => {
    root = createRoot(host);
    root.render(
      <Provider store={store}>
        <ProposedDirectivesZone conversationId={CONVERSATION} />
      </Provider>,
    );
  });
  return {
    host,
    text: () => host.textContent ?? "",
    unmount: () => {
      act(() => root?.unmount());
      host.remove();
    },
  };
}

function seed(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    proposeDirective({
      proposalId: "p1",
      conversationId: CONVERSATION,
      directive: SLUG,
      directiveClass: "action",
      noun: "create_project_with_tasks",
      summary: `${SLUG} (1 item)`,
      message: PROPOSED,
      itemCount: 1,
      shell: { __kind: SLUG, items: [{ name: "V-19 Receipt Check" }] },
    }),
  );
}

describe("the approve card answers in the server's words", () => {
  it("asks with the server's sentence and offers Approve", () => {
    const store = makeStore();
    seed(store);
    const view = mount(store);
    expect(view.text()).toContain(PROPOSED);
    expect(view.text()).toContain("Approve");
    expect(view.text()).toContain("Needs approval");
    view.unmount();
  });

  it("after Approve the card STAYS and states what happened", () => {
    const store = makeStore();
    seed(store);
    const view = mount(store);
    act(() => {
      store.dispatch(
        resolveProposal({
          conversationId: CONVERSATION,
          proposalId: "p1",
          outcome: "applied",
          outcomeMessage: APPLIED,
        }),
      );
    });
    const text = view.text();
    // The receipt is on screen — not a toast, not nothing.
    expect(text).toContain(APPLIED);
    expect(text).toContain("Done");
    // And the question is gone.
    expect(text).not.toContain("Approve");
    expect(text).not.toContain("Needs approval");
    // The old defect: the card vanished entirely.
    expect(view.host.querySelector(`[data-directive="${SLUG}"]`)).not.toBeNull();
    view.unmount();
  });

  it("a deduped re-approve does not read like a fresh write", () => {
    const store = makeStore();
    seed(store);
    const view = mount(store);
    act(() => {
      store.dispatch(
        resolveProposal({
          conversationId: CONVERSATION,
          proposalId: "p1",
          outcome: "already_applied",
          outcomeMessage: ALREADY,
        }),
      );
    });
    const text = view.text();
    expect(text).toContain("Already applied — nothing new was created.");
    expect(text).toContain("Already done");
    expect(text).not.toBe(APPLIED);
    expect(
      view.host.querySelector(`[data-outcome="already_applied"]`),
    ).not.toBeNull();
    view.unmount();
  });

  it("Decline still removes the card — a question withdrawn is not a receipt", () => {
    const store = makeStore();
    seed(store);
    const view = mount(store);
    act(() => {
      store.dispatch(
        removeProposal({ conversationId: CONVERSATION, proposalId: "p1" }),
      );
    });
    expect(view.text()).toBe("");
    view.unmount();
  });
});
