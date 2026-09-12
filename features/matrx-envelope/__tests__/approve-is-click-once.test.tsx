/**
 * ROUND 3 — ONE CLICK, ONE REQUEST; AND THE CARD CAN SAY "ALREADY APPLIED".
 *
 * V-24 on production, 2026-09-12: the Approve button was NOT disabled after the
 * first click (`b[0].disabled === false`), two clicks sent two
 * `POST /directives/confirm`, both returned 200, and `workspace.projects` got
 * TWO rows. `disabled={busy}` is a render away — two clicks inside one React
 * tick both run the handler before anything re-renders.
 *
 * Pinned here:
 *   1. two clicks in the same tick produce exactly ONE confirm request;
 *   2. the control enters a stated pending state ("Applying…") rather than
 *      looking idle while it works;
 *   3. when the server answers `already_applied`, the card renders the SERVER's
 *      already-applied sentence — the words V-24 could not reach from the UI.
 *
 * This guard is NECESSARY AND NOT SUFFICIENT. The fix is the server's claim
 * under the ledger's primary key (aidream round 3, proven with two concurrent
 * confirms against the live DB); this only stops the client asking twice.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import proposedDirectivesReducer, {
  proposeDirective,
} from "@/features/matrx-envelope/state/proposedDirectivesSlice";

const confirmCalls: unknown[] = [];
let confirmResult: Record<string, unknown> = {};
let releaseConfirm: (() => void) | null = null;

jest.mock("@/features/directive-catalog/service", () => ({
  confirmDirective: jest.fn(async (_baseUrl: string, body: unknown) => {
    confirmCalls.push(body);
    await new Promise<void>((resolve) => {
      releaseConfirm = resolve;
    });
    return confirmResult;
  }),
}));

jest.mock("@/utils/supabase/client", () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    order: () => Promise.resolve({ data: [], error: null }),
  };
  return { supabase: { schema: () => ({ from: () => builder }) } };
});

import { ProposedDirectivesZone } from "@/features/matrx-envelope/components/ProposedDirectivesZone";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION = "33333333-3333-3333-3333-333333333333";
const SLUG = "directive_v1_action_create_project_with_tasks";
const APPLIED = "Created project “V-24 Double Approve” with 2 task(s) and 0 subtask(s).";
const ALREADY =
  "Already applied — nothing new was created. Originally: Created project “V-24 Double Approve” with 2 task(s) and 0 subtask(s).";

function mount() {
  const store = configureStore({
    reducer: {
      proposedDirectives: proposedDirectivesReducer,
      apiConfig: apiConfigReducer,
    },
  });
  store.dispatch(
    proposeDirective({
      proposalId: "p1",
      conversationId: CONVERSATION,
      directive: SLUG,
      directiveClass: "action",
      noun: "create_project_with_tasks",
      summary: `${SLUG} (1 item)`,
      message: "Proposed — confirm to run 1 create project with tasks.",
      itemCount: 1,
      shell: { __kind: SLUG, items: [{ name: "V-24 Double Approve" }] },
    }),
  );
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
  const approve = () =>
    [...host.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").includes("Approve") || (b.textContent ?? "").includes("Applying"),
    ) as HTMLButtonElement | undefined;
  return {
    host,
    approve,
    text: () => host.textContent ?? "",
    unmount: () => {
      act(() => root?.unmount());
      host.remove();
    },
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  confirmCalls.length = 0;
  releaseConfirm = null;
  confirmResult = {
    directive: SLUG,
    proposal_id: "p1",
    applied: 1,
    failed: 0,
    message: APPLIED,
    receipts: [{ kind: "directive_apply.item", status: "applied", message: APPLIED }],
  };
});

describe("Approve is a click-once control", () => {
  it("sends exactly ONE confirm for two clicks in the same tick", async () => {
    const view = mount();
    const button = view.approve()!;
    expect(button).toBeDefined();

    // Exactly what the verifier did: click(); click(); with no render between.
    act(() => {
      button.click();
      button.click();
    });

    expect(confirmCalls).toHaveLength(1);
    releaseConfirm?.();
    await settle();
    view.unmount();
  });

  it("says it is working, instead of looking idle while it works", async () => {
    const view = mount();
    act(() => {
      view.approve()!.click();
    });
    const pending = view.approve()!;
    expect(pending.disabled).toBe(true);
    expect(pending.getAttribute("data-approve-state")).toBe("applying");
    expect(view.text()).toContain("Applying…");

    releaseConfirm?.();
    await settle();
    view.unmount();
  });

  it("renders the SERVER's already-applied sentence when the server says so", async () => {
    confirmResult = {
      directive: SLUG,
      proposal_id: "p1",
      applied: 1,
      failed: 0,
      message: ALREADY,
      receipts: [
        { kind: "directive_apply.item", status: "already_applied", message: ALREADY },
      ],
    };
    const view = mount();
    act(() => {
      view.approve()!.click();
    });
    releaseConfirm?.();
    await settle();

    expect(view.text()).toContain("Already applied — nothing new was created.");
    expect(view.text()).toContain("Already done");
    expect(
      view.host.querySelector('[data-outcome="already_applied"]'),
    ).not.toBeNull();
    view.unmount();
  });
});
