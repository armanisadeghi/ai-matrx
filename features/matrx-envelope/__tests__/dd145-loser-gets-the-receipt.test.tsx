/**
 * DD-145 — THE CONCURRENT LOSER ENDS UP WITH THE RECEIPT, NOT "IT'S HAPPENING".
 *
 * V-24 on production, 2026-09-12: two confirms raced, the server's claim wait was
 * 20 s and the handler took 17 s, and the loser's wait beat the holder by 0.23 s.
 * Past the wait the loser writes nothing — right, and the whole point — but it
 * answers "that is already being applied right now" instead of the receipt, so
 * the person who clicked twice is never told what was created.
 *
 * The mechanism is the server's: the wait is now derived from the door's own
 * request timeout (aidream `CLAIM_WAIT_SECONDS`, 45 s under the public ALB's 60 s
 * idle timeout), proven RED→GREEN against the live database in
 * `aidream/tests_trials/dd145_loser_waits_for_the_receipt.py`.
 *
 * This is the CLIENT residue — a holder slower than the door itself. Pinned here:
 *   1. the id-less `already_applied` answer is recognised as "still finishing"
 *      and never rendered as a completed apply;
 *   2. the card states the server's sentence with its remedy while it waits —
 *      nothing silent, nothing dead-looking;
 *   3. the zone re-reads the ledger, and when the receipt lands the waiting card
 *      stands down so the apply is on screen EXACTLY ONCE, never twice.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import apiConfigReducer from "@/lib/redux/slices/apiConfigSlice";
import proposedDirectivesReducer, {
  proposeDirective,
} from "@/features/matrx-envelope/state/proposedDirectivesSlice";

const SLUG = "directive_v1_action_create_project_with_tasks";
const CONVERSATION = "44444444-4444-4444-4444-444444444444";

/** aidream `ledger._prior_or_wait` — the honest in-flight sentence, verbatim. */
const STILL_APPLYING =
  "That is already being applied right now — nothing was created twice. " +
  "The receipt appears here as soon as it finishes; reloading this " +
  "conversation also shows it.";
/** aidream `receipt_words.applied_sentence` — what the holder eventually wrote. */
const RECEIPT = "Created project “DD-145 Slow Handler” with 20 task(s) and 40 subtask(s).";

/** What the ledger read returns; the test moves it from empty to the receipt. */
let ledgerRows: Record<string, unknown>[] = [];
let confirmResult: Record<string, unknown> = {};

jest.mock("@/features/directive-catalog/service", () => ({
  confirmDirective: jest.fn(async () => confirmResult),
}));

jest.mock("@/utils/supabase/client", () => {
  const builder = {
    select: () => builder,
    eq: () => builder,
    not: () => builder,
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    order: () => Promise.resolve({ data: ledgerRows, error: null }),
  };
  return { supabase: { schema: () => ({ from: () => builder }) } };
});

import { ProposedDirectivesZone } from "@/features/matrx-envelope/components/ProposedDirectivesZone";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** The OVERRUN answer: `already_applied` that names NOTHING, because nothing
 *  has been created yet to name. A real replay always carries the holder's ids. */
const OVERRUN_ANSWER = {
  directive: SLUG,
  proposal_id: "p1",
  applied: 1,
  failed: 0,
  message: STILL_APPLYING,
  receipts: [
    {
      kind: "directive_apply.item",
      directive: SLUG,
      index: 0,
      status: "already_applied",
      resource_kind: "",
      resource_ids: [],
      summary: STILL_APPLYING,
      message: STILL_APPLYING,
    },
  ],
};

/** A genuine replay of a FINISHED apply — it names what it made. */
const REAL_REPLAY = {
  ...OVERRUN_ANSWER,
  message: `Already applied — nothing new was created. Originally: ${RECEIPT}`,
  receipts: [
    {
      ...OVERRUN_ANSWER.receipts[0],
      resource_kind: "project",
      resource_ids: ["11111111-2222-3333-4444-555555555555"],
      summary: RECEIPT,
      message: `Already applied — nothing new was created. Originally: ${RECEIPT}`,
    },
  ],
};

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
      shell: { __kind: SLUG, items: [{ name: "DD-145 Slow Handler" }] },
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
  return {
    host,
    text: () => host.textContent ?? "",
    approve: () =>
      [...host.querySelectorAll("button")].find((b) =>
        (b.textContent ?? "").includes("Approve"),
      ) as HTMLButtonElement | undefined,
    unmount: () => {
      act(() => root?.unmount());
      host.remove();
    },
  };
}

/** Let every pending microtask (the mocked fetches) settle inside act(). */
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("DD-145 — the loser waits for the receipt instead of announcing the wait", () => {
  beforeEach(() => {
    ledgerRows = [];
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it("an id-less already_applied is a WAIT, and the ledger's receipt replaces it", async () => {
    confirmResult = OVERRUN_ANSWER;
    const view = mount();
    await settle();

    act(() => {
      view.approve()?.click();
    });
    await settle();

    // 1 + 2 — recognised as still finishing, stated in the server's words with
    // its remedy. Never "Done", never "Already done", never a dead card.
    expect(view.host.querySelector('[data-outcome="in_flight"]')).not.toBeNull();
    expect(view.text()).toContain("Finishing");
    expect(view.text()).toContain("The receipt appears here as soon as it finishes");
    expect(view.text()).not.toContain("Already done");
    expect(view.text()).not.toContain("Approve");

    // The holder finishes: its row lands in the ledger.
    ledgerRows = [
      {
        key: "act:dd145receipt",
        kind: "action",
        type: "create_project_with_tasks",
        message: RECEIPT,
        created_at: "2026-09-13T00:00:00Z",
      },
    ];
    await act(async () => {
      jest.advanceTimersByTime(2_000);
      await Promise.resolve();
      await Promise.resolve();
    });
    await settle();

    // 3 — the apply is on screen EXACTLY ONCE: the ledger's receipt, and the
    // waiting card has stood down.
    const text = view.text();
    expect(text).toContain(RECEIPT);
    expect(text).not.toContain("Finishing");
    expect(view.host.querySelector('[data-outcome="in_flight"]')).toBeNull();
    expect(text.split(RECEIPT).length - 1).toBe(1);
    view.unmount();
  });

  it("a REAL replay still reads as already applied — the tell is the ids, not the words", async () => {
    confirmResult = REAL_REPLAY;
    const view = mount();
    await settle();

    act(() => {
      view.approve()?.click();
    });
    await settle();

    expect(view.host.querySelector('[data-outcome="already_applied"]')).not.toBeNull();
    expect(view.text()).toContain("Already done");
    expect(view.text()).not.toContain("Finishing");
    view.unmount();
  });
});
