/**
 * FORCING TESTS — THE REVIEW WINDOW IS ON THE ROW BEFORE THE CLICK.
 *
 * Round-3 hostile verification (common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R3.md` § A-N7, the round's assigned
 * measurement): aidream reads `hitl.google.review_timeout_hours` lazily at both
 * approval doors and refuses an expired apply with 403 carrying the whole expiry
 * sentence — and `features/approvals/` had no reader of that knob at all. So an
 * expired proposal rendered with a live Approve button and no mark: the screen
 * did not lie, but it could not say so until AFTER the person clicked.
 *
 * So this build reads the same knob the same way and pre-marks the row with the
 * SERVER'S OWN SENTENCE. Same boundary (`age > hours`, exclusive), same safe
 * direction (0, negative, unreadable or unregistered = never expires, loudly),
 * and the 403 remains the authority: the client only stops offering a button
 * whose refusal is already known.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApprovalKind, ApprovalScope } from "@/features/approvals/types";

const mockQueryAssists = jest.fn();
const mockEnsureKnob = jest.fn();

jest.mock("@/features/assists/service", () => ({
  getAssistById: jest.fn(),
  queryAssists: (...args: unknown[]) => mockQueryAssists(...args),
  decideAssist: jest.fn(),
  emitAssist: jest.fn(),
}));
jest.mock("@ai-matrx/data/db", () => ({ readAllRows: jest.fn() }));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ from: () => ({}) }) }),
}));
// TWO knobs are resolved on this path now: the review window (what this suite
// measures) and `approvals.queue_page_size` (how big a page the read asks for,
// SETTINGS-3). The page size is served at its seeded default so that a failure
// here is always about the window.
jest.mock("@/lib/scoped-config/effectiveKnobs", () => ({
  ensureEffectiveKnob: (...args: unknown[]) => {
    const ref = args[2] as string | { key?: string };
    if (typeof ref !== "string" && ref?.key === "queue_page_size") {
      return Promise.resolve(50);
    }
    return mockEnsureKnob(...args);
  },
  useEffectiveKnob: () => 50,
}));
jest.mock("../registry", () => ({ APPROVAL_KINDS: [] }));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/components/navigation/AppLink", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
jest.mock("@/components/ui/confirm-dialog", () => ({ ConfirmDialog: () => null }));

// eslint-disable-next-line import/first -- after the mocks above
import { ApprovalQueue } from "../ApprovalQueue";
// eslint-disable-next-line import/first -- after the mocks above
import { listPendingProposals } from "../data";
// eslint-disable-next-line import/first -- after the mocks above
import { __resetRenderWarningsForTests } from "../rendered";
// eslint-disable-next-line import/first -- after the mocks above
import {
  expirySentence,
  isExpiredProposal,
  readReviewWindowHours,
  REVIEW_TIMEOUT_KNOB,
} from "../review-window";

const personScope = { key: "u1", organizationId: "o1", userId: "u1" };

/**
 * `expiry_sentence` in `aidream/services/google_workspace/approvals.py`,
 * verbatim. The client shows the server's words so a person cannot read two
 * accounts of one rule (§ A-N3 is the same law one door over).
 */
const SERVER_24H =
  "This change was proposed more than 24 hours ago, which is how long this " +
  "organization gives a Google change to be reviewed, so it can no longer be " +
  "applied — what it was going to write may not match the file any more. Reject it " +
  "and ask for the change again.";

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

function row(id: string, createdAt: string) {
  return {
    id,
    status: "pending",
    createdAt,
    result: null,
    action: {
      kind: "approval_proposal" as const,
      proposalKind: "sheet_write",
      mode: "mode_4" as const,
      payload: { __kind: "sheet_write_dry_run", preview: {}, arguments: {} },
      operatorUserId: "u1",
    },
  };
}

let warned: string[] = [];

beforeEach(() => {
  warned = [];
  __resetRenderWarningsForTests();
  mockQueryAssists.mockReset();
  mockEnsureKnob.mockReset();
  jest.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    warned.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the knob is read the way the server reads it", () => {
  it("names the same knob", () => {
    expect(REVIEW_TIMEOUT_KNOB).toBe("hitl.google.review_timeout_hours");
  });

  it("takes a positive number of hours, and a numeric string like float() does", () => {
    expect(readReviewWindowHours(24)).toBe(24);
    expect(readReviewWindowHours("24")).toBe(24);
    expect(readReviewWindowHours(0.5)).toBe(0.5);
  });

  it("0, negative, unreadable or absent = NEVER EXPIRES, and says so", () => {
    expect(readReviewWindowHours(0)).toBeNull();
    expect(readReviewWindowHours(-3)).toBeNull();
    expect(readReviewWindowHours("soon")).toBeNull();
    expect(readReviewWindowHours(null)).toBeNull();
    expect(readReviewWindowHours(undefined)).toBeNull();
    // Never silent: an admin who set a value nobody can read must be able to
    // find out why nothing expires.
    expect(warned.join(" ")).toContain("hitl.google.review_timeout_hours");
  });
});

describe("the boundary is the server's boundary", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("exactly the window is still actionable; a millisecond past it is not", () => {
    expect(
      isExpiredProposal("2026-09-16T12:00:00.000Z", 24, now),
    ).toBe(false);
    expect(
      isExpiredProposal("2026-09-16T11:59:59.999Z", 24, now),
    ).toBe(true);
  });

  it("no window means nothing expires", () => {
    expect(isExpiredProposal("2020-01-01T00:00:00.000Z", null, now)).toBe(false);
  });

  it("a row with no readable clock cannot be judged stale, and says so", () => {
    expect(isExpiredProposal("not a date", 24, now)).toBe(false);
    expect(isExpiredProposal(null, 24, now)).toBe(false);
    expect(warned.join(" ").toLowerCase()).toContain("review window");
  });

  it("prints the server's sentence, to the character", () => {
    expect(expirySentence(24)).toBe(SERVER_24H);
    // `%g`: no trailing zeros, either.
    expect(expirySentence(0.5)).toContain("more than 0.5 hours ago");
    expect(expirySentence(24.0)).toContain("more than 24 hours ago");
  });
});

describe("the page read marks the row", () => {
  it("marks a row past the window and leaves a fresh one alone", async () => {
    mockEnsureKnob.mockResolvedValue(24);
    const now = Date.now();
    mockQueryAssists.mockResolvedValue({
      rows: [
        row("old", new Date(now - 30 * 3600_000).toISOString()),
        row("fresh", new Date(now - 1 * 3600_000).toISOString()),
      ],
      total: 2,
      unreadable: 0,
    });

    const page = await listPendingProposals("u1", askingKind(), personScope);
    const byId = new Map(page.proposals.map((p) => [p.assist.id, p]));
    expect(byId.get("old")?.expired?.sentence).toBe(SERVER_24H);
    expect(byId.get("fresh")?.expired).toBeNull();
    // The window knob is resolved for the org and the person, once for the page
    // (the page-size knob is answered by the mock above and never reaches here).
    expect(mockEnsureKnob).toHaveBeenCalledWith("o1", "u1", REVIEW_TIMEOUT_KNOB);
    expect(mockEnsureKnob).toHaveBeenCalledTimes(1);
  });

  it("an unreadable knob leaves every row decidable", async () => {
    mockEnsureKnob.mockRejectedValue(new Error("knob_resolve failed: boom"));
    mockQueryAssists.mockResolvedValue({
      rows: [row("old", "2020-01-01T00:00:00.000Z")],
      total: 1,
      unreadable: 0,
    });
    const page = await listPendingProposals("u1", askingKind(), personScope);
    expect(page.proposals[0]?.expired).toBeNull();
    expect(warned.join(" ")).toContain("hitl.google.review_timeout_hours");
  });
});

describe("the queue offers no Approve over an expired row", () => {
  let container: HTMLDivElement;
  let root: Root;

  const expiredKind: ApprovalKind = {
    id: "fake",
    label: "Fake",
    accept: { label: "Take it", keepsReason: false },
    reject: { label: "Keep mine", keepsReason: false },
    useSource: (_scope: ApprovalScope) => ({
      items: [
        {
          key: "fake:one",
          kindId: "fake",
          headline: "row one",
          acceptEffect: "accept",
          rejectEffect: "reject",
          mode: "mode_4" as const,
          expired: { sentence: SERVER_24H },
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

  it("shows the sentence, drops Approve, keeps Reject", async () => {
    await act(async () => {
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <ApprovalQueue
            scope={personScope}
            registry={[expiredKind]}
            defaultExpanded
            hideWhenEmpty={false}
          />
        </QueryClientProvider>,
      );
    });
    const text = container.textContent ?? "";
    expect(text).toContain("can no longer be applied");
    const labels = [...container.querySelectorAll("button")].map(
      (button) => button.textContent ?? "",
    );
    expect(labels.join("|")).not.toContain("Take it");
    expect(labels.join("|")).toContain("Keep mine");
  });
});
