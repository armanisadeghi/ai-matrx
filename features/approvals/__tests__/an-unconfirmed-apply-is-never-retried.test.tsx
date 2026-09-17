/**
 * FORCING TESTS — "WE DO NOT KNOW" IS ITS OWN ANSWER, AND IT NEVER OFFERS A RETRY.
 *
 * aidream lane B-10 (2026-09-17, `/projects/google-native/VERIFY-U-P4-U-M1-R3.md`
 * § A-N1) stopped reporting every apply failure as a denial. Each of the six
 * Google actions can raise AFTER Google accepted the write — a sheet write PUTs
 * then reads back, an append inserts then reads back, both creates create the
 * file then register it — so `apply_google_approval` now MEASURES the phase
 * (`services/provider_write_phase.py`) and records a failure after commitment as
 * `receipt.state === "applied_unconfirmed"`: the row stays claimed, the receipt
 * carries `phase: "after_provider_write"` and `may_have_landed`, and the server's
 * sentence says *"the change may have been made; check the document before
 * retrying"*.
 *
 * This build could not read that state at all. `readApprovalReceipt` narrowed
 * four states and everything else to `unknown`, so the honest new state landed in
 * the bucket for "a shape this build cannot read" — and on the queue an
 * unconfirmed row would have kept the **"Try again"** control, which is the one
 * thing the server refuses to offer, because an append is not idempotent and the
 * second press is a second block in the person's document.
 *
 * So: the state is read, the SERVER'S sentence is printed verbatim (F-21's rule),
 * no retry is offered, and the receipt-state ladder is a switch with a `never`
 * default so the NEXT state aidream adds fails `pnpm type-check` instead of
 * reading as applied or failed.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Json } from "@/types/database.types";
import type { ApprovalKind } from "@/features/approvals/types";

const mockQueryAssists = jest.fn();
const mockGetAssistById = jest.fn();

jest.mock("@/features/assists/service", () => ({
  getAssistById: (...args: unknown[]) => mockGetAssistById(...args),
  queryAssists: (...args: unknown[]) => mockQueryAssists(...args),
  decideAssist: jest.fn(),
  emitAssist: jest.fn(),
}));
jest.mock("@ai-matrx/data/db", () => ({ readAllRows: jest.fn() }));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ from: () => ({}) }) }),
}));
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  ensureEffectiveKnob: async () => null,
}));
jest.mock("../registry", () => ({ APPROVAL_KINDS: [] }));
jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));

// eslint-disable-next-line import/first -- after the mocks above
import { ApprovalQueue } from "../ApprovalQueue";
// eslint-disable-next-line import/first -- after the mocks above
import { readProposalStatus } from "../data";
// eslint-disable-next-line import/first -- after the mocks above
import {
  readApprovalReceipt,
  readDecisionReply,
  type ApprovalReceiptState,
} from "../receipt";

/**
 * `unconfirmed_sentence()` in `aidream/services/google_workspace/approvals.py`,
 * as the door returns it. The client prints these words; it never writes its own
 * over them (round-3 verification § A-N3).
 */
const SERVER_SENTENCE =
  "AI Matrx sent this change to Google and then lost the answer (the read-back " +
  "timed out. What had already happened: the text was appended to the document.) " +
  "So the change may have been made; check the document before retrying. This " +
  "approval has NOT been retried and will not retry itself, because doing the " +
  "same thing twice here would append or create a second copy. Open the file, " +
  "see what is there, and if the change is missing ask for it again.";

const UNCONFIRMED_RECEIPT = {
  __kind: "google_workspace_approval_receipt",
  state: "applied_unconfirmed",
  phase: "after_provider_write",
  action: "append_document",
  error: "the read-back timed out",
  may_have_landed: "the text was appended to the document",
  sentence: SERVER_SENTENCE,
} as unknown as Json;

describe("the receipt adapter reads the state aidream now writes", () => {
  it("narrows `applied_unconfirmed` — never to `unknown`", () => {
    const receipt = readApprovalReceipt(UNCONFIRMED_RECEIPT);
    expect(receipt.state).toBe("applied_unconfirmed");
    expect(receipt.phase).toBe("after_provider_write");
    expect(receipt.mayHaveLanded).toBe("the text was appended to the document");
    expect(receipt.sentence).toBe(SERVER_SENTENCE);
  });

  it("still calls a state this build does not know `unknown`", () => {
    expect(readApprovalReceipt({ state: "quantum" }).state).toBe("unknown");
  });

  /**
   * THE EXHAUSTIVENESS PROOF, at the type level. Adding a state to
   * `ApprovalReceiptState` without answering for it here — and in the switch in
   * `../receipt.ts` — fails `pnpm type-check`, which is the point: an unknown
   * state must never be able to read as applied or as failed.
   */
  it("answers for every state there is", () => {
    const answered: Record<ApprovalReceiptState, true> = {
      applying: true,
      applied: true,
      applied_unconfirmed: true,
      failed: true,
      rejected: true,
      unknown: true,
    };
    expect(Object.keys(answered).sort()).toEqual([
      "applied",
      "applied_unconfirmed",
      "applying",
      "failed",
      "rejected",
      "unknown",
    ]);
  });
});

describe("the one decision reading, over an unconfirmed apply", () => {
  const receipt = readApprovalReceipt(UNCONFIRMED_RECEIPT);

  it.each(["accept", "reject"] as const)(
    "%s: the server's sentence verbatim, and no retry in it",
    (decision) => {
      const reading = readDecisionReply({
        status: "accepted",
        appliedNow: false,
        receipt,
        decision,
        what: "Q3 retro",
        serverSentence: SERVER_SENTENCE,
      });
      // Not `performed` (nothing is confirmed) and not `failed` (the change may
      // have been made) — its own bucket, so no count and no toast says either.
      expect(reading.bucket).toBe("unconfirmed");
      expect(reading.message).toContain(SERVER_SENTENCE);
      expect(reading.message).not.toMatch(/Try again/i);
      expect(reading.message).not.toMatch(/NOT made/i);
      expect(reading.message).not.toMatch(/the change was made/i);
    },
  );

  it("derives a sentence that still refuses a retry when the reply carried none", () => {
    const reading = readDecisionReply({
      status: "accepted",
      appliedNow: false,
      receipt,
      decision: "accept",
      what: "Q3 retro",
      serverSentence: null,
    });
    expect(reading.bucket).toBe("unconfirmed");
    expect(reading.message).toMatch(/may have been made/i);
    expect(reading.message).toContain("the text was appended to the document");
    expect(reading.message).not.toMatch(/Try again/i);
  });
});

describe("a deep link to an unconfirmed row says what is true about it", () => {
  it("is neither `decided` nor `apply_failed`", async () => {
    mockGetAssistById.mockResolvedValue({
      id: "assist-1",
      status: "accepted",
      createdAt: "2026-09-17T00:00:00Z",
      result: UNCONFIRMED_RECEIPT,
      action: {
        kind: "approval_proposal",
        proposalKind: "document_append",
        mode: "mode_4",
        payload: { __kind: "document_append_dry_run" },
        operatorUserId: "u1",
      },
    });
    const read = await readProposalStatus({
      userId: "u1",
      proposalId: "assist-1",
      mounted: [],
      scope: { key: "u1", organizationId: "o1", userId: "u1" },
    });
    expect(read.status).toBe("applied_unconfirmed");
    expect(read.error).toBe("the read-back timed out");
  });
});

describe("the queue shows the sentence and offers NO retry", () => {
  let container: HTMLDivElement;
  let root: Root;

  const unconfirmedKind: ApprovalKind = {
    id: "fake",
    label: "Fake",
    accept: { label: "Write it", keepsReason: false },
    reject: { label: "Leave it alone", keepsReason: false },
    useSource: () => ({
      items: [
        {
          key: "fake:one",
          kindId: "fake",
          headline: "row one",
          acceptEffect: "accept",
          rejectEffect: "reject",
          mode: "mode_4" as const,
          lastAttempt: {
            state: "applied_unconfirmed" as const,
            sentence: SERVER_SENTENCE,
          },
        },
      ],
      total: 1,
      loading: false,
      error: null,
      refetch: () => undefined,
    }),
    useDecisions: () => ({
      acceptItems: async () => ({ applied: 0, failures: [] }),
      rejectItems: async () => ({ applied: 0, failures: [] }),
    }),
  };

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /**
   * NO DECISION CONTROLS AT ALL, and that is the server's shape, not a
   * convenience: an unconfirmed row is `accepted` with `_reopen_if_failed`
   * refusing to return it to the queue, so `reject_google_approval` answers
   * `_already_decided` and changes nothing. A Reject button there would be a
   * click that silently does nothing. The sentence sends the person to the file.
   */
  it("prints the server's words and offers no decision control at all", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ApprovalQueue
            scope={{ key: "u1", organizationId: "o1", userId: "u1" }}
            registry={[unconfirmedKind]}
            defaultExpanded
            hideWhenEmpty={false}
          />
        </QueryClientProvider>,
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain("check the document before retrying");
    const labels = [...container.querySelectorAll("button")]
      .map((button) => button.textContent ?? "")
      .join("|");
    expect(labels).not.toContain("Try again");
    expect(labels).not.toContain("Write it");
    expect(labels).not.toContain("Leave it alone");
  });
});
