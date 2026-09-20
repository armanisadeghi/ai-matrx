/**
 * FORCING TEST — SELECT-ALL AND BATCH APPROVE MUST NEVER OFFER A RETRY ON A
 * RECEIPT `noLiveAction` ALREADY REFUSES.
 *
 * Cursor Bugbot, frontend PR 228, review comment 4042916419 (High):
 * `selectable` (`../ApprovalQueue.tsx`) hand-listed the states that keep a row
 * out of a batch — `individualReview`, `blocked`, `inFlight`, `unreadable`,
 * `unknownState`, `expired` — and left out `applied_unconfirmed`, even though
 * `noLiveAction(item)` (asked once for the row's own checkbox, its decision
 * buttons, and `individualReview`) already refuses every control over that
 * state. A write that reaches Google and loses the answer (`receipt.ts` §
 * `applied_unconfirmed`) must never be retried — an append or a create is not
 * idempotent, so a second Approve on that row appends or creates a second copy
 * of a change that may already be sitting in the person's document. Select-all
 * still ticked the row, and batch Approve resubmitted it: the exact class
 * B-18/B-25 closed on the server, reopened by the client offering the retry the
 * server refuses.
 *
 * Fixed at the class, not the state: `selectable` now asks `noLiveAction(item)`
 * — the SAME predicate the row's own checkbox already asks — instead of a
 * second, independently-maintained list. A future receipt state that
 * `noLiveAction` learns to refuse reaches select-all and batch approve/reject
 * the moment it reaches the row, with nothing here to forget.
 *
 * RED on HEAD (the hand-listed `selectable` filter): the `applied_unconfirmed`
 * row is ticked by select-all and appears in the batch Approve's submitted
 * ids. GREEN after: only the ordinary `pending` row is ticked and submitted.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApprovalItem, ApprovalKind, ApprovalScope } from "../types";
import {
  APPROVAL_RECEIPT_SERVER_STATES,
  readApprovalReceipt,
  receiptRowMarks,
} from "../receipt";

jest.mock("../registry", () => ({ APPROVAL_KINDS: [] }));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn(), info: jest.fn() },
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onConfirm,
    confirmLabel,
  }: {
    open: boolean;
    onConfirm: () => void;
    confirmLabel: string;
  }) =>
    open ? (
      <button data-testid="confirm" onClick={() => onConfirm()}>
        {confirmLabel}
      </button>
    ) : null,
}));

// eslint-disable-next-line import/first -- after the mocks above
import { ApprovalQueue, noLiveAction } from "../ApprovalQueue";

const SCOPE: ApprovalScope = { key: "u1", organizationId: "o1", userId: "u1" };

const acceptItems = jest.fn(async (items: { key: string }[]) => ({
  applied: items.length,
  failures: [],
}));
const rejectItems = jest.fn(async (items: { key: string }[]) => ({
  applied: items.length,
  failures: [],
}));

/** One kind with a plain pending row and one whose last attempt reached
 *  Google and lost the answer — the exact shape `receiptRowMarks` returns for
 *  `receipt.state === "applied_unconfirmed"`. */
const fakeKind: ApprovalKind = {
  id: "fake",
  label: "Fake",
  accept: { label: "Approve", keepsReason: false },
  reject: { label: "Reject", keepsReason: false },
  useSource: () => ({
    items: [
      {
        key: "fake:pending-1",
        kindId: "fake",
        headline: "an ordinary waiting row",
        acceptEffect: "does the thing",
        rejectEffect: "leaves it alone",
        mode: "mode_4" as const,
      },
      {
        key: "fake:unconfirmed-1",
        kindId: "fake",
        headline: "a row whose write reached Google and lost the answer",
        acceptEffect: "does the thing",
        rejectEffect: "leaves it alone",
        mode: "mode_4" as const,
        ...receiptRowMarks({
          __kind: "google_workspace_approval_receipt",
          state: "applied_unconfirmed",
        }),
      },
    ] satisfies ApprovalItem[],
    total: 2,
    loading: false,
    error: null,
    refetch: () => undefined,
  }),
  useDecisions: () => ({ acceptItems, rejectItems }),
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  acceptItems.mockClear();
  rejectItems.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = async () => {
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

async function renderQueue() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ApprovalQueue
          scope={SCOPE}
          registry={[fakeKind]}
          defaultExpanded
          hideWhenEmpty={false}
        />
      </QueryClientProvider>,
    );
  });
  await flush();
}

describe("select-all never ticks a row applied_unconfirmed keeps live", () => {
  it("ticks only the pending row, and batch Approve submits exactly one id", async () => {
    await renderQueue();
    expect(container.textContent).toContain("an ordinary waiting row");
    expect(container.textContent).toContain("reached Google and lost the answer");

    const selectAll = container.querySelector<HTMLInputElement>(
      '[aria-label="Select every proposal shown"]',
    );
    expect(selectAll).not.toBeNull();
    act(() => selectAll?.click());
    await flush();

    // "Select all N shown" must count only the actionable row — the
    // unconfirmed row is never part of a batch, so N is 1, not 2.
    expect(container.textContent).toContain("1 of 2 shown selected");

    const pendingCheckbox = container.querySelector<HTMLInputElement>(
      '[aria-label="Select: an ordinary waiting row"]',
    );
    const unconfirmedCheckbox = container.querySelector<HTMLInputElement>(
      '[aria-label="Select: a row whose write reached Google and lost the answer"]',
    );
    expect(pendingCheckbox?.getAttribute("data-state")).toBe("checked");
    // The unconfirmed row's own checkbox is disabled and was never selected —
    // this is `noLiveAction` refusing the row's OWN control, not the bug this
    // test is for; the bug was select-all ticking it anyway.
    expect(unconfirmedCheckbox?.getAttribute("data-state")).not.toBe("checked");
    expect(unconfirmedCheckbox?.hasAttribute("disabled")).toBe(true);

    const approveButton = [...container.querySelectorAll("button")].find(
      (button) => (button.textContent ?? "").startsWith("Approve "),
    );
    expect(approveButton?.textContent).toBe("Approve 1");
    act(() => approveButton?.click());
    await flush();

    const confirm = container.querySelector<HTMLButtonElement>(
      "[data-testid=confirm]",
    );
    expect(confirm).not.toBeNull();
    act(() => confirm?.click());
    await flush();

    expect(acceptItems).toHaveBeenCalledTimes(1);
    const submitted = acceptItems.mock.calls[0]?.[0] as { key: string }[];
    expect(submitted.map((item) => item.key)).toEqual(["fake:pending-1"]);
  });
});

describe("the predicate refuses every non-actionable state the census names", () => {
  const nonActionableStates = new Set([
    "applying",
    "applied_unconfirmed",
  ]);

  it.each(APPROVAL_RECEIPT_SERVER_STATES)(
    "server state %s agrees between `receiptRowMarks` and `noLiveAction`",
    (state) => {
      const marks = receiptRowMarks({
        __kind: "google_workspace_approval_receipt",
        state,
      });
      const item: ApprovalItem = {
        key: "k",
        kindId: "fake",
        headline: "h",
        acceptEffect: "a",
        rejectEffect: "r",
        mode: "mode_4",
        ...marks,
      };
      expect(noLiveAction(item)).toBe(nonActionableStates.has(state));
    },
  );

  it("a receipt state this build has never heard of is refused too", () => {
    const marks = receiptRowMarks({
      __kind: "google_workspace_approval_receipt",
      state: "queued_for_retry",
    });
    expect(readApprovalReceipt({ state: "queued_for_retry" }).state).toBe(
      "unrecognized",
    );
    const item: ApprovalItem = {
      key: "k",
      kindId: "fake",
      headline: "h",
      acceptEffect: "a",
      rejectEffect: "r",
      mode: "mode_4",
      ...marks,
    };
    expect(noLiveAction(item)).toBe(true);
  });

  it("an ordinary, never-approved row (no receipt) keeps its controls", () => {
    const marks = receiptRowMarks(null);
    const item: ApprovalItem = {
      key: "k",
      kindId: "fake",
      headline: "h",
      acceptEffect: "a",
      rejectEffect: "r",
      mode: "mode_4",
      ...marks,
    };
    expect(noLiveAction(item)).toBe(false);
  });
});
