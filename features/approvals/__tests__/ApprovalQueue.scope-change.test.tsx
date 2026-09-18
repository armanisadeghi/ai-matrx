/**
 * FORCING TEST — A DEEP LINK IS RE-RESOLVED WHEN THE MOUNT CHANGES.
 *
 * Bugbot round 10, finding 3 (frontend PR 228): the deep-link effect read the
 * mount's whole scope, the kinds it carries and the registry, but re-ran only on
 * `[focusItemId, focusedKey, loading, scope.userId]`. Switch the site (or the
 * kinds, or the subject) under the same `?item=` and the queue kept the previous
 * mount's verdict — and the previous mount's DOOR — on screen: the marketing
 * console mounts one queue per site, so a row resolved against site A stayed
 * resolved against site A while the reader was looking at site B.
 *
 * The effect now keys on a derived signature of every input the resolution
 * reads, so a scope change re-resolves. This drives the REAL `ApprovalQueue`;
 * only the store seam is stood in for, and it answers FROM THE SCOPE it is
 * handed — which is the whole point.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  ApprovalFocusDetail,
  ApprovalFocusResolution,
  ApprovalKind,
  ApprovalScope,
} from "@/features/approvals/types";

let mockKinds: ApprovalKind[] = [];

/**
 * The seam answers from the SCOPE it was given: site A still holds the row, site
 * B does not and says where it lives. A mock that ignored the scope could not
 * tell a re-resolution from a stale verdict.
 */
const mockReadProposalStatus = jest.fn(
  async (question: { scope: ApprovalScope }) =>
    question.scope.siteId === "site-a"
      ? { status: "pending" }
      : {
          status: "not_in_this_list",
          explain: "this keyword proposal belongs to alpha.example.",
          where: { label: "Open the approvals for alpha.example", href: "/marketing/operations/approvals" },
        },
);

jest.mock("../registry", () => ({
  get APPROVAL_KINDS() {
    return mockKinds;
  },
}));
jest.mock("../data", () => ({
  readProposalStatus: (...args: unknown[]) =>
    mockReadProposalStatus(...(args as [{ scope: ApprovalScope }])),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
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

const emptyKind: ApprovalKind = {
  id: "static",
  label: "Static",
  accept: { label: "Approve", keepsReason: false },
  reject: { label: "Reject", keepsReason: false },
  // Nothing on screen, so the focused id is always resolved by the direct read.
  useSource: () => ({
    items: [],
    total: 0,
    loading: false,
    error: null,
    refetch: () => undefined,
  }),
  useDecisions: () => ({
    acceptItems: async () => ({ applied: 0, failures: [] }),
    rejectItems: async () => ({ applied: 0, failures: [] }),
  }),
};

const siteA: ApprovalScope = {
  key: "site-a",
  organizationId: "org-1",
  userId: "u1",
  siteId: "site-a",
};
const siteB: ApprovalScope = {
  key: "site-b",
  organizationId: "org-1",
  userId: "u1",
  siteId: "site-b",
};

const flush = async () => {
  for (let index = 0; index < 12; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

describe("the deep-link resolution follows the mount", () => {
  let container: HTMLDivElement;
  let root: Root;
  let resolutions: {
    resolution: ApprovalFocusResolution;
    detail?: ApprovalFocusDetail;
  }[];

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true;
    mockKinds = [emptyKind];
    mockReadProposalStatus.mockClear();
    resolutions = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("re-resolves the same focused id when the scope switches sites", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const render = (scope: ApprovalScope) =>
      act(() => {
        root.render(
          <QueryClientProvider client={client}>
            <ApprovalQueue
              scope={scope}
              focusItemId="row-x"
              hideWhenEmpty={false}
              onFocusResolved={(_id, resolution, detail) =>
                resolutions.push({ resolution, ...(detail ? { detail } : {}) })
              }
            />
          </QueryClientProvider>,
        );
      });

    render(siteA);
    await flush();
    expect(resolutions.at(-1)?.resolution).toBe("pending_elsewhere");
    const readsAfterA = mockReadProposalStatus.mock.calls.length;
    expect(readsAfterA).toBeGreaterThan(0);

    // Same `?item=`, different mount — the console swaps one site's queue for
    // another's around the same id.
    render(siteB);
    await flush();

    expect(mockReadProposalStatus.mock.calls.length).toBeGreaterThan(readsAfterA);
    expect(mockReadProposalStatus.mock.calls.at(-1)?.[0]?.scope.siteId).toBe(
      "site-b",
    );
    // The verdict AND the door moved with the mount.
    expect(resolutions.at(-1)?.resolution).toBe("not_in_this_list");
    expect(resolutions.at(-1)?.detail?.where?.href).toBe(
      "/marketing/operations/approvals",
    );
  });

  it("re-resolves when the kinds the mount carries change", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const render = (kinds: readonly string[] | undefined) =>
      act(() => {
        root.render(
          <QueryClientProvider client={client}>
            <ApprovalQueue
              scope={siteA}
              kinds={kinds}
              focusItemId="row-x"
              hideWhenEmpty={false}
            />
          </QueryClientProvider>,
        );
      });

    render(undefined);
    await flush();
    const before = mockReadProposalStatus.mock.calls.length;

    // A host narrowing to a kind that is not this one leaves the queue mounting
    // nothing — a different question about the same id, so it is asked again.
    render(["something_else"]);
    await flush();
    expect(mockReadProposalStatus.mock.calls.length).toBeGreaterThan(before);
  });
});
