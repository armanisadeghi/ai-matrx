/**
 * FORCING TESTS — AN EXPIRED ROW CARRIES NO LIVE CONTROL, WHICHEVER KIND OWNS IT.
 *
 * Cursor Bugbot round 11 on frontend PR 228 (review comment 4041427572, Medium):
 * *"Expired Gmail still offers Send. The review-window change drops row-level
 * Approve when `expired` is set, but Gmail never uses that button. Its send
 * control lives in `individualReview`, and that card still mounts on an expired
 * row, so Send stays live until the door returns 403."*
 *
 * It was right, and the instance fix (teach `gmail-send` about `expired`) would
 * have been the wrong one: `individualReview` is the contract's "this kind brings
 * its own review surface" slot, so ANY kind can put a live action there and the
 * next one would rediscover this. The gate is therefore in the QUEUE, once —
 * `noLiveAction()` — and it answers for every state in which no control may still
 * do something: expired, an apply in flight, a row this build cannot read, and an
 * outcome that reached Google with the answer lost.
 *
 * The census of kinds that define `individualReview` today: `gmail_send` (the
 * Gmail review card, whose Send posts straight to `/gmail/send-reviewed`) and
 * `keyword_meaning` (a guidelines document, which never sets `expired` because the
 * review window is a `hitl.google` knob). Both are covered by the queue gate, and
 * the last test here fails if a future kind's live action escapes it.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApprovalItem, ApprovalKind } from "@/features/approvals/types";

/** `expiry_sentence` in aidream's `approvals.py`, as the row carries it. */
const SERVER_EXPIRED =
  "This change was proposed more than 24 hours ago, which is how long this " +
  "organization gives a Google change to be reviewed, so it can no longer be " +
  "applied — what it was going to write may not match the file any more. Reject it " +
  "and ask for the change again.";

/** The real `gmail_send` payload shape — flat, as `narrowGmailSendPayload` reads it. */
const GMAIL_PAYLOAD = {
  __kind: "gmail_send_proposal",
  connectionId: "conn-1",
  fromEmail: "me@example.com",
  to: "sam@example.com",
  cc: [],
  subject: "Following up",
  body: "Hello there.",
};

let expired: { sentence: string } | null = { sentence: SERVER_EXPIRED };

jest.mock("../data", () => ({
  APPROVAL_SURFACE: "matrx-user/approval-queue",
  APPROVAL_PAGE_SIZE: 50,
  listPendingProposals: async () => ({
    proposals: [
      {
        assist: {
          id: "assist-1",
          title: "Email to sam@example.com",
          createdAt: "2026-09-15T10:00:00Z",
          result: null,
        },
        proposalKind: "gmail_send",
        mode: "mode_4",
        autoApplyAt: null,
        proposerLabel: "the CRM follow-up agent",
        proposerAgentId: "a1",
        proposerRunId: "r1",
        operatorUserId: "u1",
        payload: GMAIL_PAYLOAD,
        blocked: null,
        subject: null,
        expired,
      },
    ],
    total: 1,
  }),
  readProposalStatus: async () => ({ status: "unknown" }),
  recordApprovalDecision: jest.fn(),
}));
jest.mock("@/features/crm/compliance/service", () => ({
  checkSendEligibility: async () => ({ allowed: true, blocks: [] }),
}));
jest.mock("@/features/agents/ui-first-tools/redux/ask-resolver-registry", () => ({
  registerAskResolver: () => undefined,
  resolveAskByCallId: () => undefined,
  cancelAskByCallId: () => undefined,
}));
/**
 * 🚨 THE REAL `GmailReviewCard` IS MOUNTED HERE (round-4 verification § V14-7,
 * the manufactured-data finding: *"replaces the real `GmailReviewCard` with a
 * stand-in `<button>Send email</button>`, so it proves the QUEUE's gate and not
 * that the real card's control disappears"*). Only the card's two outside edges
 * are stubbed — the reviewed-send POST and the Google connection inventory —
 * because everything this suite is about is the card's own Send button and
 * whether the queue mounts it. Its label is "Send", from the card itself.
 */
jest.mock("@/features/google-workspace/service", () => ({
  // The narrowed outcome the transport answers with — the server writes the sent
  // record and reports it (aidream `4dbffdffb`); nothing in the browser does.
  sendReviewedGmail: jest.fn(async () => ({
    messageId: "sent-1",
    to: "sam@example.com",
    cc: [],
    interactionId: "interaction-1",
    recordFailure: null,
    associationsWritten: [],
    associationFailures: [],
    sendingEventId: null,
    sendingEventGap: null,
    compliance: null,
    warnings: [],
    auditColumnsWritten: [],
  })),
}));
/**
 * The ONE component swapped inside the real card, and it is not a control: the
 * body field. The shipped `ProTextarea` drags the voice-capture stack (mic device
 * enumeration, the global recording provider, the transcription-cleanup agent
 * hook) into a suite about whether a Send button is mounted, and jsdom has no
 * media devices. A plain textarea keeps the card's own state, its own edits and
 * its own Send exactly as shipped — the finding (§ V14-7) was that the CARD was
 * a stand-in, not that its textarea was.
 */
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: ({
    value,
    onChange,
    ...rest
  }: {
    value?: string;
    onChange?: (event: unknown) => void;
  }) => <textarea value={value} onChange={onChange} {...rest} />,
}));
jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({
    data: {
      connections: [
        {
          id: "conn-1",
          provider: "google",
          account_email: "me@example.com",
          status: "connected",
          scopes: ["https://www.googleapis.com/auth/gmail.send"],
        },
      ],
      resources: [],
    },
    isLoading: false,
    isError: false,
  }),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => null,
}));
jest.mock("@/lib/redux/hooks", () => ({
  // The real card mounts the real `ProTextarea`, which reaches the recordings
  // slice through the global recording provider. There is no store here, so a
  // selector over a slice this suite does not stand up reads as absent rather
  // than throwing — the card's own state is what is under test.
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ recordings: {} }),
  useAppDispatch: () => jest.fn(),
  // The card's body field is the real `ProTextarea`, whose AI action reads the
  // store. Nothing in this suite dispatches; the store is only consulted.
  useAppStore: () => ({
    getState: () => ({}),
    dispatch: () => undefined,
    subscribe: () => () => undefined,
  }),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "u1",
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
import { ApprovalQueue, noLiveAction } from "../ApprovalQueue";
// eslint-disable-next-line import/first -- after the mocks above
import { gmailSendKind } from "../kinds/gmail-send";

const SCOPE = { key: "u1", organizationId: "o1", userId: "u1" };

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  // The real card renders through `AgentCardShell`, which asks `useIsMobile()`;
  // jsdom has no `matchMedia`. Desktop is the honest default for this assertion.
  // …and the card's shell fades its scroll edges through a ResizeObserver.
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  expired = { sentence: SERVER_EXPIRED };
});

async function renderQueue(registry: ApprovalKind[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ApprovalQueue
          scope={SCOPE}
          registry={registry}
          defaultExpanded
          hideWhenEmpty={false}
        />
      </QueryClientProvider>,
    );
  });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if ((container.textContent ?? "").includes("sam@example.com")) break;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  return {
    text: container.textContent ?? "",
    labels: [...container.querySelectorAll("button")]
      .map((button) => button.textContent ?? "")
      .join("|"),
  };
}

describe("the real Gmail kind on an expired row", () => {
  it("mounts NO send control, and says why instead", async () => {
    const screen = await renderQueue([gmailSendKind]);
    expect(screen.text).toContain("sam@example.com");
    // The reason is on the row BEFORE any click (§ A-N7).
    expect(screen.text).toContain("can no longer be applied");
    // 🚨 The finding: the review card — and with it its Send — used to mount anyway.
    expect(screen.labels).not.toContain("Send");
    expect(screen.text).not.toContain("Nothing sends until you press Send");
  });

  it("still mounts the REAL card, with its own Send, when the row is NOT expired", async () => {
    expired = null;
    const screen = await renderQueue([gmailSendKind]);
    // The real card's own words and its own control — proof that the assertion
    // above measured the thing the person would have clicked.
    expect(screen.text).toContain("Nothing sends until you press Send");
    expect(screen.labels).toContain("Send");
    // And what it would send is on screen and editable, as the card promises.
    expect(screen.text).toContain("Following up");
  });
});

/**
 * THE CONTRACT, for every kind there is or will be: a row the queue judges
 * `noLiveAction` renders no `individualReview`. Driven through the real queue with
 * a stand-in kind per state, because the gate is the queue's and a kind that
 * forgets must still be safe.
 */
describe("no kind can mount a live action on a row nobody may act on", () => {
  const withMark = (mark: Partial<ApprovalItem>): ApprovalKind => ({
    id: "fake",
    label: "Fake",
    accept: { label: "Do it", keepsReason: false },
    reject: { label: "Leave it", keepsReason: false },
    useSource: () => ({
      items: [
        {
          key: "fake:one",
          kindId: "fake",
          headline: "sam@example.com row",
          acceptEffect: "accept",
          rejectEffect: "reject",
          mode: "mode_4" as const,
          individualReview: <button type="button">Send email</button>,
          ...mark,
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
  });

  const cases: { name: string; mark: Partial<ApprovalItem> }[] = [
    { name: "expired", mark: { expired: { sentence: SERVER_EXPIRED } } },
    { name: "an apply in flight", mark: { inFlight: { sentence: "applying." } } },
    {
      name: "a row this build cannot read",
      mark: { unreadable: { sentence: "cannot be shown." } },
    },
    {
      name: "a receipt state this build has never heard of",
      mark: {
        unknownState: {
          state: "queued_for_retry",
          sentence: "a state this screen does not know: `queued_for_retry`.",
        },
      },
    },
    {
      name: "an outcome that may have landed",
      mark: {
        lastAttempt: {
          state: "applied_unconfirmed" as const,
          sentence: "it may have been made.",
        },
      },
    },
  ];

  it.each(cases)("$name: the action is not on screen", async ({ mark }) => {
    const screen = await renderQueue([withMark(mark)]);
    expect(screen.text).toContain("sam@example.com");
    expect(screen.labels).not.toContain("Send email");
    // And the predicate itself agrees, so a kind may ask it directly.
    expect(
      noLiveAction({
        key: "k",
        kindId: "fake",
        headline: "h",
        acceptEffect: "a",
        rejectEffect: "r",
        mode: "mode_4",
        ...mark,
      }),
    ).toBe(true);
  });

  it("an ordinary waiting row keeps its kind's action", async () => {
    const screen = await renderQueue([withMark({})]);
    expect(screen.labels).toContain("Send email");
  });
});
