/**
 * FORCING TEST — ACCEPT AND REJECT READ THE SAME RECEIPT AND SAY THE SAME FACTS.
 *
 * Bugbot round 10, finding 2 (frontend PR 228): the reject path branched on the
 * door's `status` alone. A reply of `accepted` printed, verbatim, *"had already
 * been APPROVED and the change was made, so it could not be rejected. Undo it
 * where it landed."* — without ever reading `receipt.state`. The accept path had
 * already been fixed to require `receipt.state === "applied"` before claiming
 * the change was made (round-2 verification § A-iii), so the two paths gave a
 * person opposite facts about the same row: approve said "the record does not
 * say whether the change was actually made", reject said it was made and sent
 * them hunting for something to undo.
 *
 * So there is ONE adapter (`../receipt.ts` → `readDecisionReply`) and both paths
 * go through it. This suite runs THE SAME FOUR RECEIPTS through accept and
 * reject on the real kind's real `useDecisions`, and asserts the two sentences
 * agree on the two facts that matter: was the change made, and is anything still
 * running.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Json } from "@/types/database.types";
import type {
  ApprovalItem,
  ApprovalKind,
  ApprovalOutcome,
} from "@/features/approvals/types";

const mockApply = jest.fn();
const mockReject = jest.fn();

jest.mock("../google-door", () => ({
  applyGoogleApproval: (...args: unknown[]) => mockApply(...(args as [])),
  rejectGoogleApproval: (...args: unknown[]) => mockReject(...(args as [])),
}));
jest.mock("../data", () => ({
  APPROVAL_SURFACE: "matrx-user/approval-queue",
  APPROVAL_PAGE_SIZE: 50,
  // The seam takes the asking kind itself (§ A-N5), so the stub reads its id.
  listPendingProposals: async (_userId: string, kind: { id: string }) => ({
    proposals: [
      {
        assist: {
          id: "assist-1",
          title: `a ${kind.id} proposal`,
          createdAt: "2026-09-17T00:00:00Z",
          result: null,
        },
        proposalKind: kind.id,
        mode: "mode_4",
        autoApplyAt: null,
        proposerLabel: "Research agent",
        proposerAgentId: null,
        proposerRunId: null,
        operatorUserId: "user-1",
        payload: {
          __kind: "document_append_dry_run",
          preview: {
            action: "append_document",
            dry_run: true,
            file_id: "doc-9",
            title: "Q3 retro",
            total_chars: 10,
            open_in_google: "https://docs.google.com/document/d/doc-9",
            would_append: {
              position: "end_of_document",
              after_char: 10,
              text: "one line",
              document_ends_with: "…end.",
            },
          },
          arguments: { file_id: "doc-9", text: "one line" },
        } as unknown as Json,
        blocked: null,
        subject: null,
      },
    ],
    total: 1,
  }),
  recordApprovalDecision: jest.fn(),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: ({ id }: { id: string }) => <a>{id}</a>,
}));

// eslint-disable-next-line import/first -- after the mocks above
import { documentAppendKind } from "../kinds/document-append";

const SCOPE = { key: "user-1", organizationId: "org-1", userId: "user-1" };

interface Harness {
  items: ApprovalItem[];
  accept: (items: ApprovalItem[]) => Promise<ApprovalOutcome>;
  reject: (items: ApprovalItem[]) => Promise<ApprovalOutcome>;
}

let harness: Harness | null = null;

function Probe({ kind }: { kind: ApprovalKind }) {
  const source = kind.useSource(SCOPE);
  const decisions = kind.useDecisions(SCOPE);
  harness = {
    items: source.items,
    accept: (items) => decisions.acceptItems(items, null),
    reject: (items) => decisions.rejectItems(items, null, null),
  };
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

async function readyItems(): Promise<ApprovalItem[]> {
  container = document.createElement("div");
  document.body.appendChild(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <Probe kind={documentAppendKind} />
      </QueryClientProvider>,
    );
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (harness && harness.items.length > 0) break;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return harness!.items;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  harness = null;
  mockApply.mockReset();
  mockReject.mockReset();
});

/** Every sentence an outcome carries, whatever bucket it landed in. */
function saidBy(outcome: ApprovalOutcome): string {
  return [
    ...outcome.failures.map((entry) => entry.message),
    ...(outcome.alreadyDecided ?? []).map((entry) => entry.message),
  ].join(" ");
}

/** What a person can read OUT of the sentence — the facts, not the wording. */
function facts(outcome: ApprovalOutcome): {
  changeWasMade: boolean;
  changeWasNotMade: boolean;
  stillRunning: boolean;
  recordSilent: boolean;
  performed: number;
} {
  const said = saidBy(outcome);
  return {
    changeWasMade:
      /the change was made|Undo it where it landed/i.test(said) &&
      !/the change was NOT made/i.test(said),
    changeWasNotMade: /NOT made/i.test(said),
    stillRunning: /being applied now/i.test(said),
    recordSilent: /does not say/i.test(said),
    performed: outcome.applied,
  };
}

/** The four receipts aidream's `apply_google_approval` can write. */
const RECEIPTS: Record<string, Json> = {
  applied: {
    __kind: "google_workspace_approval_receipt",
    state: "applied",
    action: "append_document",
    output: {},
  } as unknown as Json,
  failed: {
    __kind: "google_workspace_approval_receipt",
    state: "failed",
    error: "Google refused the request: the document is read-only.",
  } as unknown as Json,
  applying: {
    __kind: "google_workspace_approval_receipt",
    state: "applying",
    started_at: "2026-09-17T00:00:00Z",
  } as unknown as Json,
  // No state this build can read — a shape from a server older or newer than us.
  unreadable: {} as unknown as Json,
};

async function bothPaths(receipt: Json) {
  // The SAME reply on both doors: the row was already accepted, this call
  // performed nothing, and the receipt is the first decision's evidence.
  const reply = {
    approval_id: "assist-1",
    status: "accepted",
    applied_now: false,
    receipt,
  };
  mockApply.mockResolvedValue(reply);
  mockReject.mockResolvedValue(reply);

  const acceptItems = await readyItems();
  let accepted: ApprovalOutcome | null = null;
  await act(async () => {
    accepted = await harness!.accept(acceptItems);
  });
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  harness = null;

  const rejectItems = await readyItems();
  let rejected: ApprovalOutcome | null = null;
  await act(async () => {
    rejected = await harness!.reject(rejectItems);
  });
  return { accepted: accepted!, rejected: rejected! };
}

describe("the same receipt, read on both paths, says the same thing", () => {
  it("APPLIED: both say the change was made, and neither says it was not", async () => {
    const { accepted, rejected } = await bothPaths(RECEIPTS.applied!);
    const a = facts(accepted);
    const r = facts(rejected);
    expect(a.changeWasMade).toBe(true);
    expect(r.changeWasMade).toBe(true);
    expect(a.changeWasNotMade).toBe(false);
    expect(r.changeWasNotMade).toBe(false);
    // Reject is the path that can offer the only real remedy for a change that
    // landed: undo it where it landed.
    expect(saidBy(rejected)).toContain("Undo it where it landed");
    expect(a.performed + r.performed).toBe(0);
  });

  it("FAILED: both say the change was NOT made, and neither offers an undo", async () => {
    const { accepted, rejected } = await bothPaths(RECEIPTS.failed!);
    for (const outcome of [accepted, rejected]) {
      expect(facts(outcome).changeWasNotMade).toBe(true);
      expect(facts(outcome).changeWasMade).toBe(false);
      expect(saidBy(outcome)).not.toContain("Undo it where it landed");
      // The refusal, verbatim, on both paths.
      expect(saidBy(outcome)).toContain("read-only");
    }
  });

  it("APPLYING: both say it is running, and neither claims it was made", async () => {
    const { accepted, rejected } = await bothPaths(RECEIPTS.applying!);
    for (const outcome of [accepted, rejected]) {
      expect(facts(outcome).stillRunning).toBe(true);
      expect(facts(outcome).changeWasMade).toBe(false);
      expect(saidBy(outcome)).not.toContain("Undo it where it landed");
    }
  });

  it("UNREADABLE: both say the record does not say — neither invents the answer", async () => {
    const { accepted, rejected } = await bothPaths(RECEIPTS.unreadable!);
    for (const outcome of [accepted, rejected]) {
      expect(facts(outcome).recordSilent).toBe(true);
      expect(facts(outcome).changeWasMade).toBe(false);
      expect(facts(outcome).changeWasNotMade).toBe(false);
      expect(saidBy(outcome)).not.toContain("Undo it where it landed");
    }
  });

  it("a fresh reject the door performed is still counted", async () => {
    mockReject.mockResolvedValue({
      approval_id: "assist-1",
      status: "dismissed",
      applied_now: false,
      receipt: { state: "rejected" },
    });
    const items = await readyItems();
    let outcome: ApprovalOutcome | null = null;
    await act(async () => {
      outcome = await harness!.reject(items);
    });
    expect(outcome!.applied).toBe(1);
    expect(outcome!.failures).toHaveLength(0);
    expect(outcome!.alreadyDecided ?? []).toHaveLength(0);
  });
});
