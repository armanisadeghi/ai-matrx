/**
 * FORCING TEST — Bugbot MEDIUM, frontend PR 228, comment 4041625792:
 * "Approval badge stays stale after decisions."
 *
 * Every Google-proposal kind (`sheet_write`, `document_append`,
 * `document_create`, `spreadsheet_create`, `contact_import`, `task_import`,
 * plus every other `GoogleKindContract`) decides through the ONE shared hook,
 * `useGoogleApprovalDecisions` (`../kinds/google-proposal.tsx`). Until this
 * fix, that hook's `invalidate()` called
 * `client.invalidateQueries({ queryKey: [...googleQueryKey(kindId), userId] })`
 * — a key of `["approvals", kindId, userId]` — which is a SIBLING of, not a
 * PARENT of, the shell badge's `["approvals", "pending-count", userId]`
 * (`../usePendingApprovalCount.ts`). React Query's default `invalidateQueries`
 * match is a PREFIX match, so that call never touched the badge's query, which
 * then sat on its own `staleTime: 60_000` for up to a minute after every real
 * approve/reject.
 *
 * `sheetWriteKind` stands for the whole family here: it is the shared hook's
 * real, unmocked caller — nothing about this test is specific to sheets.
 *
 * Only the network door and the store seam are mocked; `useGoogleApprovalDecisions`
 * itself runs for real, against a real `QueryClient`.
 */

jest.mock("../google-door", () => ({
  applyGoogleApproval: jest.fn(async () => ({
    approval_id: "assist-1",
    status: "accepted",
    applied_now: true,
    receipt: {},
  })),
  rejectGoogleApproval: jest.fn(async () => ({
    approval_id: "assist-1",
    status: "dismissed",
    applied_now: false,
    receipt: {},
  })),
}));
jest.mock("../data", () => ({
  APPROVAL_SURFACE: "matrx-user/approval-queue",
  APPROVAL_PAGE_SIZE: 50,
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
          __kind: "sheet_write_dry_run",
          preview: { rangeLabel: "A1:B2", before: [], after: [] },
          arguments: {},
        },
        blocked: null,
        subject: null,
      },
    ],
    total: 1,
  }),
  recordApprovalDecision: jest.fn(async () => undefined),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "user-1",
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => null,
}));

/* eslint-disable import/first -- after the mocks above */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApprovalItem, ApprovalScope } from "../types";
import { sheetWriteKind } from "../kinds/sheet-write";
import { PENDING_APPROVALS_QUERY_KEY } from "../queryKeys";
/* eslint-enable import/first */

const SCOPE: ApprovalScope = {
  key: "user-1",
  organizationId: "org-1",
  userId: "user-1",
};

interface Harness {
  items: ApprovalItem[];
  accept: (items: ApprovalItem[]) => Promise<unknown>;
}

let harness: Harness | null = null;

function Probe() {
  const source = sheetWriteKind.useSource(SCOPE);
  const decisions = sheetWriteKind.useDecisions(SCOPE);
  harness = {
    items: source.items,
    accept: (items) => decisions.acceptItems(items, null),
  };
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  harness = null;
});

async function mount(client: QueryClient): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (harness && harness.items.length > 0) break;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe("the shell badge settles after a Google-kind decision", () => {
  it("invalidates PENDING_APPROVALS_QUERY_KEY when a proposal is approved", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    await mount(client);

    expect(harness).not.toBeNull();
    expect(harness!.items.length).toBeGreaterThan(0);

    await act(async () => {
      await harness!.accept(harness!.items);
    });

    // 🚨 THE FAILING ASSERTION BEFORE THE FIX: the hook invalidated
    // `["approvals", "sheet_write", "user-1"]` but never
    // `PENDING_APPROVALS_QUERY_KEY`, so this call was never made.
    const invalidatedBadge = invalidateSpy.mock.calls.some(([arg]) => {
      const key = (arg as { queryKey?: unknown[] } | undefined)?.queryKey;
      if (!Array.isArray(key)) return false;
      return PENDING_APPROVALS_QUERY_KEY.every((segment, i) => key[i] === segment);
    });
    expect(invalidatedBadge).toBe(true);
  });
});
