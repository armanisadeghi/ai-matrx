/**
 * ROUND 2 — THE RECEIPT SURVIVES A REFRESH.
 *
 * V-19 on production: Approve wrote the project and the chat said nothing; after
 * a reload there was nothing at all, because the receipt had only ever been a
 * stream event, a REST response, or a four-second toast. Walk K-1 named the
 * shape of it — *"the chat keeps the request while the ledger keeps the result,
 * joined by nothing the UI reads."*
 *
 * Chair ruling, 2026-09-12: receipts persist by READING THE ACTION LEDGER, never
 * by faking a message part. Pinned here:
 *   1. the ledger read is scoped to the conversation and drops wordless rows;
 *   2. the sentence is rendered VERBATIM — a row's `message` comes back
 *      character-for-character, so no future change can start composing wording
 *      from `receipt` or from counts;
 *   3. a fresh mount (i.e. a reload) shows the receipt with no Redux state at
 *      all — the exact thing that was missing;
 *   4. a read failure says so; it never renders as "no receipts".
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import proposedDirectivesReducer from "@/features/matrx-envelope/state/proposedDirectivesSlice";

const rows: Record<string, unknown>[] = [];
let readError: { message: string } | null = null;
const captured: { conversationId?: string; notNullColumn?: string } = {};

jest.mock("@/utils/supabase/client", () => {
  const builder = {
    select: () => builder,
    eq: (_col: string, value: string) => {
      captured.conversationId = value;
      return builder;
    },
    not: (col: string) => {
      captured.notNullColumn = col;
      return builder;
    },
    order: () => Promise.resolve({ data: readError ? null : rows, error: readError }),
  };
  return {
    supabase: {
      schema: () => ({ from: () => builder }),
    },
  };
});

import {
  fetchConversationReceipts,
  slugForLedgerRow,
} from "@/features/matrx-envelope/conversationReceipts";
import { ProposedDirectivesZone } from "@/features/matrx-envelope/components/ProposedDirectivesZone";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION = "22222222-2222-2222-2222-222222222222";
/** The exact sentence aidream stored on the ledger row for this apply. */
const SENTENCE = "Created project “V-19 Receipt Check” with 2 task(s) and 0 subtask(s).";

function seedRows() {
  rows.length = 0;
  readError = null;
  rows.push(
    {
      key: "act:d64bbf706c2f2fcd05df79de84b7899e070ffcd0",
      kind: "action",
      type: "create_project_with_tasks",
      message: SENTENCE,
      created_at: "2026-09-12T07:15:59.806Z",
    },
    {
      // A pre-receipt apply: no words. Rendering an invented sentence for it
      // would be worse than silence.
      key: "act:0000000000000000000000000000000000000000",
      kind: "action",
      type: "create_task",
      message: "   ",
      created_at: "2026-09-12T07:16:59.806Z",
    },
  );
}

function mountZone() {
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
    text: () => host.textContent ?? "",
    unmount: () => {
      act(() => root?.unmount());
      host.remove();
    },
  };
}

/** Let the mount's ledger read settle. */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("the ledger is what a reload reads", () => {
  beforeEach(seedRows);

  it("asks the ledger for THIS conversation, and only for rows that have words", async () => {
    const receipts = await fetchConversationReceipts(CONVERSATION);
    expect(captured.conversationId).toBe(CONVERSATION);
    expect(captured.notNullColumn).toBe("message");
    // The wordless row is dropped client-side too, not shown blank.
    expect(receipts).toHaveLength(1);
    expect(receipts[0].message).toBe(SENTENCE);
    expect(receipts[0].ledgerKey).toBe(
      "act:d64bbf706c2f2fcd05df79de84b7899e070ffcd0",
    );
  });

  it("reconstructs the slug from the row's own (kind, type) — never guesses one", () => {
    expect(slugForLedgerRow("action", "create_project_with_tasks")).toBe(
      "directive_v1_action_create_project_with_tasks",
    );
    expect(slugForLedgerRow("create", "create:task")).toBe(
      "directive_v1_create_task",
    );
    // A pre-merge row's kind is an old envelope kind: null, not a guess.
    expect(slugForLedgerRow("output_directive", "create_project_with_tasks")).toBeNull();
    expect(slugForLedgerRow("create", "task")).toBeNull();
  });

  it("a FRESH MOUNT with no Redux state shows the receipt — this is the reload", async () => {
    const view = mountZone();
    await settle();
    expect(view.text()).toContain(SENTENCE);
    expect(
      view.host.querySelector(
        '[data-directive="directive_v1_action_create_project_with_tasks"]',
      ),
    ).not.toBeNull();
    view.unmount();
  });

  it("renders the stored sentence VERBATIM — nothing recomposed from the row", async () => {
    const view = mountZone();
    await settle();
    // Character-for-character, including the curly quotes the handler wrote.
    expect(view.text()).toContain(SENTENCE);
    // And no count line reintroduced from anywhere.
    expect(view.text()).not.toMatch(/affected/);
    view.unmount();
  });

  it("a read failure SAYS SO — it never looks like 'nothing happened here'", async () => {
    readError = { message: "permission denied for table matrx_action_ledger" };
    const view = mountZone();
    await settle();
    expect(view.text()).toContain("Could not load what this conversation's actions did");
    expect(view.text()).toContain("permission denied");
    view.unmount();
  });
});
