/**
 * FORCING TEST — a decision must never update a component that has not
 * mounted, and must never tear down the kinds' readers (KI-045 follow-up).
 *
 * Seen live during a "Keep mine" (placement drift): React warned "Can't
 * perform a React state update on a component that hasn't mounted yet". This
 * drives the REAL `ApprovalQueue` through the path deciding the last row takes
 * — decide → the kind's writer settles its query → the list empties and the
 * queue collapses to its hidden state — with and without StrictMode (Next dev
 * renders under it), with a stand-in kind AND with the real placement-drift
 * kind (only its network seam is mocked; its reader and writer are real).
 */

import * as React from "react";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ApprovalKind, ApprovalScope } from "@/features/approvals/types";

let mockKinds: ApprovalKind[] = [];
let mockDriftRows: Array<Record<string, unknown>> = [];
const mockSetKeywordOffering = jest.fn(async () => []);
let slotMounts = 0;

jest.mock("../registry", () => ({
  get APPROVAL_KINDS() {
    return mockKinds;
  },
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock("@/features/marketing/components/shared/MarketingUi", () => ({
  InlineQueryError: () => <div>error</div>,
}));
jest.mock("@/features/overlays/openers/keywordWindow", () => ({
  useOpenKeywordWindow: () => () => undefined,
}));
jest.mock("@/features/marketing/seo/keyword-workbench/data", () => ({
  KEYWORD_OFFERINGS_KEY: ["marketing", "seo", "keyword-offerings"],
  getOfferingPlacementDrift: async () => [...mockDriftRows],
  setKeywordOffering: (...args: unknown[]) => mockSetKeywordOffering(...(args as [])),
  confirmKeywordOfferings: (...args: unknown[]) => mockSetKeywordOffering(...(args as [])),
}));
jest.mock("@/features/marketing/seo/keyword-workbench/hooks/useSiteOfferings", () => ({
  SITE_OFFERINGS_KEY: ["marketing", "offerings"],
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
import { ApprovalQueue } from "../ApprovalQueue";
// eslint-disable-next-line import/first -- after the mocks above
import { placementDriftKind } from "../kinds/seo/placement-drift";

let fakeRows: string[] = [];

const fakeKind: ApprovalKind = {
  id: "fake",
  label: "Fake",
  accept: { label: "Take it", keepsReason: false },
  reject: { label: "Keep mine", keepsReason: false },
  useSource: (scope: ApprovalScope) => {
    React.useEffect(() => {
      slotMounts += 1;
    }, []);
    const query = useQuery({
      queryKey: ["fake", scope.siteId],
      queryFn: async () => [...fakeRows],
    });
    const items = (query.data ?? []).map((id) => ({
      key: `fake:${id}`,
      kindId: "fake",
      headline: `row ${id}`,
      acceptEffect: "accept",
      rejectEffect: "reject",
    }));
    return {
      items,
      total: items.length,
      loading: query.isLoading,
      error: query.error,
      refetch: () => void query.refetch(),
    };
  },
  useDecisions: (scope: ApprovalScope) => {
    const client = useQueryClient();
    const decide = async (items: { key: string }[]) => {
      fakeRows = fakeRows.filter(
        (id) => !items.some((item) => item.key === `fake:${id}`),
      );
      void client.invalidateQueries({ queryKey: ["fake", scope.siteId] });
      return { applied: items.length, failures: [] };
    };
    return { acceptItems: decide, rejectItems: decide };
  },
};

const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

const DRIFT_ROW = {
  keywordId: "k1",
  phrase: "hard drive shredding",
  oldOfferingId: "o-old",
  oldOfferingName: "Old offering",
  newOfferingId: "o-new",
  newOfferingName: "New offering",
  confidence: 60,
  changedAt: "2026-09-14T00:00:00Z",
};

describe("ApprovalQueue decision lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let errors: string[];
  let spy: jest.SpyInstance;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    fakeRows = ["one"];
    mockDriftRows = [DRIFT_ROW];
    mockSetKeywordOffering.mockClear();
    slotMounts = 0;
    errors = [];
    spy = jest
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        errors.push(args.map(String).join(" "));
      });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    spy.mockRestore();
  });

  const cases: Array<[string, boolean]> = [
    ["Keep mine", false],
    ["Keep mine", true],
    ["Take it", false],
    ["Take it", true],
  ];

  it.each(cases)(
    "deciding the last row with %s (StrictMode: %s) is clean",
    async (label, strict) => {
      mockKinds = [fakeKind];
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const scope = {
        siteId: "s1",
        brandId: "b1",
        organizationId: "o1",
        siteLabel: "site",
      };
      const tree = (
        <QueryClientProvider client={client}>
          <ApprovalQueue scope={scope} defaultExpanded />
        </QueryClientProvider>
      );
      act(() => {
        root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
      });
      await flush();
      const mountsBeforeDecision = slotMounts;
      const button = [...container.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === label,
      );
      expect(button).toBeDefined();
      act(() => button?.click());
      await flush();
      const confirm = container.querySelector<HTMLButtonElement>(
        "[data-testid=confirm]",
      );
      expect(confirm).not.toBeNull();
      // The drift kind re-reads after its write; the row is gone server-side.
      mockDriftRows = [];
      act(() => confirm?.click());
      await flush();

      // The row is gone and the queue collapsed to its hidden state …
      expect(container.textContent).not.toContain("row one");
      expect(container.textContent).not.toContain("hard drive shredding");
      // … without React reporting an update on a not-yet-mounted component …
      expect(
        errors.filter((line) => /hasn't mounted yet|has not mounted/i.test(line)),
      ).toEqual([]);
      // … and without tearing down and remounting the kinds' readers: a
      // collapse is a render change, never a new reader.
      expect(slotMounts).toBe(mountsBeforeDecision);
    },
  );
});
