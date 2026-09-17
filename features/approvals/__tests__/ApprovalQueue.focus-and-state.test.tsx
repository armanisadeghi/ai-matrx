/**
 * FORCING TESTS for the three approval-queue findings Bugbot raised on
 * 2026-09-17 (F-2 fix lane). Each one drives the REAL `ApprovalQueue` (and,
 * for the deep-link copy, the REAL `ApprovalsWorkspace`); only the network
 * seam and the registry are stood in for.
 *
 * 1. A ROW WHOSE STATE CHANGED IS RE-READ. A kind that reports a row as
 *    blocked ("checking this recipient") and then, with the SAME key, reports
 *    it reviewable must reach the screen. The queue used to compare only the
 *    keys, so the first shape stuck forever.
 * 2. A DEEP LINK NEVER CLAIMS "DECIDED" WITHOUT EVIDENCE. A row missing from
 *    the loaded page is resolved by a direct read of that id, not by its
 *    absence: page one holds 50 rows, and row 51 is still waiting.
 * 3. A DEEP LINK INTO A COLLAPSED LIST SCROLLS. Expanding and scrolling in one
 *    turn scrolled to a row that had not rendered yet.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import type { ApprovalKind, ApprovalScope } from "@/features/approvals/types";

let mockKinds: ApprovalKind[] = [];
type ProposalStatus = "pending" | "decided" | "unknown";
const mockReadProposalStatus = jest.fn(
  async (): Promise<ProposalStatus> => "unknown",
);

jest.mock("../registry", () => ({
  get APPROVAL_KINDS() {
    return mockKinds;
  },
}));
jest.mock("../data", () => ({
  readProposalStatus: (...args: unknown[]) =>
    mockReadProposalStatus(...(args as [])),
}));
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
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "u1",
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: () => "o1",
}));

// eslint-disable-next-line import/first -- after the mocks above
import { ApprovalQueue } from "../ApprovalQueue";
// eslint-disable-next-line import/first -- after the mocks above
import { ApprovalsWorkspace } from "../ApprovalsWorkspace";

const scope: ApprovalScope = { key: "u1", organizationId: "o1", userId: "u1" };

const noDecisions = () => ({
  acceptItems: async () => ({ applied: 0, failures: [] }),
  rejectItems: async () => ({ applied: 0, failures: [] }),
});

/** Flips from "still checking" to "reviewable" under ONE unchanged key. */
let stillChecking = true;
const flipKind: ApprovalKind = {
  id: "flip",
  label: "Flip",
  accept: { label: "Approve", keepsReason: false },
  reject: { label: "Reject", keepsReason: false },
  useSource: (kindScope: ApprovalScope) => {
    const query = useQuery({
      queryKey: ["flip", kindScope.key],
      queryFn: async () => stillChecking,
    });
    const checking = query.data ?? true;
    const item = {
      key: "flip:one",
      kindId: "flip",
      headline: "Email to someone",
      acceptEffect: "Sends it.",
      rejectEffect: "Sends nothing.",
      mode: "mode_4" as const,
      ...(checking
        ? {
            blocked: {
              reason: "Checking this recipient against the unsubscribes.",
              whoCan: "It opens the moment those checks pass.",
            },
          }
        : { individualReview: <div>REVIEW CARD</div> }),
    };
    return {
      items: query.isLoading ? [] : [item],
      total: 1,
      loading: query.isLoading,
      error: query.error,
      refetch: () => void query.refetch(),
    };
  },
  useDecisions: noDecisions,
};

/** One plain row, used for the deep-link cases. */
function staticKind(items: string[]): ApprovalKind {
  return {
    id: "static",
    label: "Static",
    accept: { label: "Approve", keepsReason: false },
    reject: { label: "Reject", keepsReason: false },
    useSource: () => ({
      items: items.map((id) => ({
        key: `static:${id}`,
        kindId: "static",
        headline: `row ${id}`,
        acceptEffect: "accept",
        rejectEffect: "reject",
        mode: "mode_4" as const,
      })),
      total: items.length,
      loading: false,
      error: null,
      refetch: () => undefined,
    }),
    useDecisions: noDecisions,
  };
}

const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

describe("ApprovalQueue: row state, deep links and scrolling", () => {
  let container: HTMLDivElement;
  let root: Root;
  let scrolled: string[];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    stillChecking = true;
    mockReadProposalStatus.mockClear();
    scrolled = [];
    Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
      scrolled.push(this.id);
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("re-reads a row whose state changed under an unchanged key", async () => {
    mockKinds = [flipKind];
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ApprovalQueue scope={scope} defaultExpanded hideWhenEmpty={false} />
        </QueryClientProvider>,
      );
    });
    await flush();
    expect(container.textContent).toContain("Checking this recipient");

    // The spine answered: the same row, same key, is now reviewable.
    stillChecking = false;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["flip", "u1"] });
    });
    await flush();

    expect(container.textContent).toContain("REVIEW CARD");
    expect(container.textContent).not.toContain("Checking this recipient");
  });

  it("scrolls to a focused row even when the list starts collapsed", async () => {
    mockKinds = [staticKind(["a", "b"])];
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ApprovalQueue scope={scope} focusItemId="b" hideWhenEmpty={false} />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(container.textContent).toContain("row b");
    expect(scrolled).toContain("approval-row-static-b");
  });

  it("never says a missing row was decided when a direct read says it is pending", async () => {
    mockKinds = [staticKind(["a"])];
    mockReadProposalStatus.mockImplementation(async (): Promise<ProposalStatus> => "pending");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ApprovalsWorkspace focusItemId="beyond-page-one" />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(mockReadProposalStatus).toHaveBeenCalledWith(
      "u1",
      "beyond-page-one",
    );
    expect(container.textContent).toContain("still waiting on you");
    expect(container.textContent).not.toContain("already approved or rejected");
  });

  it("promises nothing the platform cannot produce when the queue is empty", async () => {
    // The screen is honest or absent: until a producer ships, the one sentence
    // a person reads here may not name one (U-P4 verification § A-2).
    mockKinds = [staticKind([])];
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ApprovalsWorkspace />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(container.textContent).toContain("No proposals yet");
    expect(container.textContent).not.toContain("it appears here");
  });

  it("says a missing row was decided only when the direct read proves it", async () => {
    mockKinds = [staticKind(["a"])];
    mockReadProposalStatus.mockImplementation(async (): Promise<ProposalStatus> => "decided");
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <ApprovalsWorkspace focusItemId="gone" />
        </QueryClientProvider>,
      );
    });
    await flush();

    expect(container.textContent).toContain("has already been decided");
  });
});
