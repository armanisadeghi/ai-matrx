/**
 * FORCING TESTS — A PENDING ROW THIS BUILD CANNOT SHOW IS A ROW, NOT A SILENCE.
 *
 * Round-3 hostile verification (common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R3.md` § A-N6): the page read
 * SUBTRACTED every row the predicate refused from the section total and warned
 * once in the console. With one such row and nothing else the total was
 * `max(1 - 1, 0) = 0`, so `/approvals` printed *"Nothing is waiting on you"*
 * over a durable pending proposal. The console is not a person; the deep-link
 * read answered `no_screen` honestly, so a person holding a LINK was told while
 * a person who merely opened the queue was not.
 *
 * So the refusal is rendered. The seam returns the rows it could not narrow
 * alongside the ones it could, counts them in the total, and the queue shows an
 * honest row that names the proposal kind and what to do. It offers no decision
 * controls: this build cannot read what the row proposes, so it cannot describe
 * what Approve would do — and a control whose effect nobody can state is the
 * dead end this queue exists to end.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApprovalKind, ApprovalScope } from "@/features/approvals/types";

const mockQueryAssists = jest.fn();

jest.mock("@/features/assists/service", () => ({
  getAssistById: jest.fn(),
  queryAssists: (...args: unknown[]) => mockQueryAssists(...args),
  decideAssist: jest.fn(),
  emitAssist: jest.fn(),
}));
// Only the seams are stood in for, and this one keeps the rest of its module: a bare
// factory leaves `createActiveOrgCookie` undefined, and `../data` now reaches it through
// `awaitOrganizationForRecordRead` -> appContextSlice -> activeOrgCookie, so the suite
// cannot even import (SETTINGS-3, 2026-09-22).
jest.mock("@ai-matrx/data/db", () => ({
  ...jest.requireActual("@ai-matrx/data/db"),
  readAllRows: jest.fn(),
}));
// The queue's page size is `approvals.queue_page_size`, resolved through the
// register. What this suite measures is the predicate, not the register, so the
// row is served here at its seeded default.
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  ensureEffectiveKnob: async () => 50,
  useEffectiveKnob: () => 50,
}));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ from: () => ({}) }) }),
}));
// The real registry pulls every kind (and their env-dependent services) into
// this suite; the queue under test is handed its kinds explicitly.
jest.mock("../registry", () => ({ APPROVAL_KINDS: [] }));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: () => null,
}));

// eslint-disable-next-line import/first -- after the mocks above
import { ApprovalQueue } from "../ApprovalQueue";
// eslint-disable-next-line import/first -- after the mocks above
import { listPendingProposals } from "../data";
// eslint-disable-next-line import/first -- after the mocks above
import { unrenderableApprovalItems } from "../unshowable";
// eslint-disable-next-line import/first -- after the mocks above
import { __resetRenderWarningsForTests } from "../rendered";

const personScope = { key: "u1", organizationId: "o1", userId: "u1" };

function askingKind(): ApprovalKind {
  return {
    id: "sheet_write",
    label: "Spreadsheet change",
    accept: { label: "Write it", keepsReason: false },
    reject: { label: "Leave it alone", keepsReason: true },
    useSource: () => {
      throw new Error("not used here");
    },
    useDecisions: () => {
      throw new Error("not used here");
    },
  };
}

let warned: string[] = [];

beforeEach(() => {
  warned = [];
  __resetRenderWarningsForTests();
  mockQueryAssists.mockReset();
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the seam hands back what it could not show", () => {
  it("returns the refused row, counts it, and still says the kind out loud", async () => {
    mockQueryAssists.mockResolvedValue({
      rows: [
        {
          id: "row-1",
          status: "pending",
          createdAt: "2026-09-17T00:00:00Z",
          result: null,
          action: {
            kind: "approval_proposal",
            proposalKind: "future_kind",
            mode: "mode_4",
            payload: {},
            operatorUserId: "u1",
          },
        },
      ],
      total: 1,
      unreadable: 0,
    });

    const page = await listPendingProposals("u1", askingKind(), personScope);
    expect(page.proposals).toHaveLength(0);
    // 🚨 NOT ZERO. One row is waiting; the screen must not print "nothing".
    expect(page.total).toBe(1);
    expect(page.unrenderable).toHaveLength(1);
    expect(page.unrenderable[0]).toMatchObject({
      id: "row-1",
      kindId: "future_kind",
    });
    // Loud for a developer as well as honest on screen.
    expect(warned.join(" ")).toContain("future_kind");
  });

  it("counts a row the store's own narrowing refused, with no id to name", async () => {
    mockQueryAssists.mockResolvedValue({
      rows: [],
      total: 1,
      unreadable: 1,
    });
    const page = await listPendingProposals("u1", askingKind(), personScope);
    expect(page.total).toBe(1);
    expect(page.unrenderable).toHaveLength(1);
    expect(page.unrenderable[0]?.id).toBeNull();
  });

  it("builds an honest item: the kind id, a remedy, and no decision", () => {
    const items = unrenderableApprovalItems("sheet_write", [
      { id: "row-1", kindId: "future_kind", why: "no registered kind renders it" },
    ]);
    expect(items).toHaveLength(1);
    const item = items[0];
    if (!item) throw new Error("unreachable");
    expect(item.headline.toLowerCase()).toContain("cannot show");
    expect(item.unreadable?.sentence).toContain("future_kind");
    // A remedy, not a shrug.
    expect(item.unreadable?.sentence.length ?? 0).toBeGreaterThan(60);
    // Neither Approve nor Reject can be described for it, so neither is offered.
    expect(item.mode).toBe("unresolved");
  });
});

describe("the queue shows it instead of an empty state", () => {
  let container: HTMLDivElement;
  let root: Root;

  const unshowable: ApprovalKind = {
    id: "fake",
    label: "Fake",
    accept: { label: "Take it", keepsReason: false },
    reject: { label: "Keep mine", keepsReason: false },
    useSource: (_scope: ApprovalScope) => ({
      items: unrenderableApprovalItems("fake", [
        { id: "row-1", kindId: "future_kind", why: "no registered kind renders it" },
      ]),
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

  it("prints the row and its remedy, counts it, and offers no Approve", async () => {
    const summaries: { count: number; loading: boolean }[] = [];
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ApprovalQueue
            scope={personScope}
            registry={[unshowable]}
            defaultExpanded
            hideWhenEmpty={false}
            onSummary={(_key, summary) => summaries.push(summary)}
          />
        </QueryClientProvider>,
      );
    });

    const text = container.textContent ?? "";
    expect(text).toContain("future_kind");
    expect(text.toLowerCase()).toContain("cannot show");
    // The count a person reads includes it — that is what stops the empty state
    // on `/approvals` (`ApprovalsWorkspace` shows it only at count 0).
    expect(summaries.at(-1)?.count).toBe(1);
    // No control whose effect nobody can state.
    const labels = [...container.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    );
    expect(labels.join("|")).not.toContain("Take it");
    expect(labels.join("|")).not.toContain("Keep mine");
  });
});
