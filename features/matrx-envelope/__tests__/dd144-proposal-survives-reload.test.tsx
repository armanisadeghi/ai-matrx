/**
 * DD-144 — A RELOAD STILL KNOWS WHAT THE AGENT PROPOSED, AND NEVER OFFERS TO DO
 * SOMETHING IT HAS ALREADY DONE.
 *
 * V-24 on production, 2026-09-12: a proposed directive reached this client once,
 * as a `directive_apply.proposed` stream event, and lived only in Redux. Refresh
 * and the card was gone — the action could not be approved at all, and nothing on
 * screen said so.
 *
 * The shell was never lost: it IS the assistant message's stored text (live proof
 * — `chat.message` row `aea95446-…` stores
 * `{"__kind":"directive_v1_action_create_project_with_tasks","items":[…]}` as a
 * bare JSON text part, followed by prose). What a client cannot recover from that
 * text is whether it was already applied, because the apply key is FROZEN and
 * hashes the VALIDATED item model. So the shells go back to
 * `POST /directives/apply_state` and the SERVER answers.
 *
 * Every mount here starts with an EMPTY store — that is exactly what a reload is.
 * Pinned:
 *   1. `not_applied` → the Approve card is back, in the SERVER's words;
 *   2. `applied` → NO Approve card; the ledger's receipt is the only thing shown
 *      (the Approve-beside-its-own-receipt defect);
 *   3. `in_flight` → neither, because it is neither;
 *   4. a shell the server cannot read is SAID, not silently dropped.
 *
 * The server half is proven against the live DB and the real handler by
 * `aidream/tests_trials/dd144_proposal_survives_reload.py`.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import proposedDirectivesReducer from "@/features/matrx-envelope/state/proposedDirectivesSlice";

const SLUG = "directive_v1_action_create_project_with_tasks";
const CONVERSATION = "55555555-5555-5555-5555-555555555555";
const PROPOSED = "Proposed — confirm to run 1 create project with tasks.";
const RECEIPT = "Created project “DD-144 Reload” with 2 task(s) and 0 subtask(s).";

/** The shell exactly as it sits in the stored assistant message, with prose after. */
const STORED_TEXT =
  `{"__kind":"${SLUG}","items":[{"name":"DD-144 Reload","description":null,` +
  `"tasks":[{"name":"Task One"},{"name":"Task Two"}]}]}` +
  "\n\nCaptured DD-144 Reload as a project with Task One and Task Two.";

/** What the mocked reads return; each test sets them. */
let messageRows: Record<string, unknown>[] = [];
let ledgerRows: Record<string, unknown>[] = [];
let applyStateResult: Record<string, unknown> = {};
let applyStateCalls: unknown[] = [];

jest.mock("@/features/directive-catalog/service", () => ({
  confirmDirective: jest.fn(async () => ({})),
  fetchDirectiveApplyState: jest.fn(async (_baseUrl: string, body: unknown) => {
    applyStateCalls.push(body);
    return applyStateResult;
  }),
}));

jest.mock("@/utils/supabase/client", () => {
  const make = (table: string) => {
    const rows = () =>
      table === "message"
        ? { data: messageRows, error: null }
        : { data: ledgerRows, error: null };
    const builder: Record<string, unknown> = {};
    for (const fn of ["select", "eq", "not"]) builder[fn] = () => builder;
    builder.order = () => Promise.resolve(rows());
    return builder;
  };
  return { supabase: { schema: () => ({ from: (t: string) => make(t) }) } };
});

import { ProposedDirectivesZone } from "@/features/matrx-envelope/components/ProposedDirectivesZone";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** One door answer for the single stored shell. */
function doorSays(
  state: "not_applied" | "in_flight" | "applied",
  extra: Record<string, unknown> = {},
) {
  return {
    conversation_id: CONVERSATION,
    shells: [
      {
        directive: SLUG,
        proposal_id: "0b1e909f2b15498def0152c1dc4cd441",
        directive_class: "action",
        noun: "create_project_with_tasks",
        item_count: 1,
        message: PROPOSED,
        approvable: state === "not_applied",
        unreadable: null,
        items: [
          {
            index: 0,
            state,
            message: state === "applied" ? RECEIPT : null,
            resource_ids: state === "applied" ? ["p1", "t1", "t2"] : [],
          },
        ],
        ...extra,
      },
    ],
  };
}

/** A FRESH store every time — an empty proposal inbox IS a reload. */
function mount() {
  const store = configureStore({
    reducer: {
      proposedDirectives: proposedDirectivesReducer,
      apiConfig: apiConfigReducer,
    },
  });
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
    store,
    text: () => host.textContent ?? "",
    unmount: () => {
      act(() => root?.unmount());
      host.remove();
    },
  };
}

async function settle() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("DD-144 — a reload can still approve what the agent proposed", () => {
  beforeEach(() => {
    applyStateCalls = [];
    ledgerRows = [];
    messageRows = [
      { id: "m1", content: [{ text: STORED_TEXT, type: "text" }], created_at: "2026-09-13T00:00:00Z" },
    ];
    applyStateResult = doorSays("not_applied");
  });

  it("rebuilds the Approve card from the stored message, in the server's words", async () => {
    const view = mount();
    await settle();

    expect(view.text()).toContain(PROPOSED);
    expect(view.text()).toContain("Approve");
    expect(view.text()).toContain("Needs approval");

    // The client asked the SERVER — it never decided this itself. And it sent the
    // conversation, which is the idempotency namespace the keys are computed in.
    expect(applyStateCalls).toHaveLength(1);
    const asked = applyStateCalls[0] as { shells: unknown[]; conversation_id: string };
    expect(asked.conversation_id).toBe(CONVERSATION);
    expect(asked.shells).toHaveLength(1);
    // The shell went back VERBATIM — prose stripped, nothing re-authored.
    expect(asked.shells[0]).toEqual({
      __kind: SLUG,
      items: [
        {
          name: "DD-144 Reload",
          description: null,
          tasks: [{ name: "Task One" }, { name: "Task Two" }],
        },
      ],
    });
    view.unmount();
  });

  it("NEVER puts an Approve beside its own receipt — an applied shell is a receipt only", async () => {
    applyStateResult = doorSays("applied");
    ledgerRows = [
      {
        key: "act:dd144applied",
        kind: "action",
        type: "create_project_with_tasks",
        message: RECEIPT,
        created_at: "2026-09-13T00:00:00Z",
      },
    ];
    const view = mount();
    await settle();

    const text = view.text();
    expect(text).toContain(RECEIPT);
    expect(text).not.toContain("Approve");
    expect(text).not.toContain("Needs approval");
    view.unmount();
  });

  it("an in-flight shell is neither an Approve nor a receipt", async () => {
    applyStateResult = doorSays("in_flight");
    const view = mount();
    await settle();

    expect(view.text()).not.toContain("Approve");
    expect(view.text()).not.toContain(RECEIPT);
    view.unmount();
  });

  it("NOTHING SILENT — a shell the server cannot read is said, not dropped", async () => {
    applyStateResult = doorSays("not_applied", {
      approvable: false,
      unreadable: "the stored items do not match 'directive_v1_create_note'.",
    });
    const view = mount();
    await settle();

    expect(view.text()).toContain("we could not read");
    expect(view.text()).toContain("the stored items do not match");
    expect(view.text()).not.toContain("Approve");
    view.unmount();
  });
});
