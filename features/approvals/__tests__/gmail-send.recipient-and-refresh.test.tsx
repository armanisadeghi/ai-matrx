/**
 * FORCING TESTS for the two `gmail_send` findings Bugbot raised on frontend
 * PR 228. Both drive the REAL kind (`../kinds/gmail-send`); only the network
 * seams, the review card and Redux are stood in for.
 *
 * 1. A CHANGED RECIPIENT IS RECORDED ON NO PERSON. The approver can edit `to`
 *    right up to Send. The write used to drop only the contact point and still
 *    stamp the sent record onto the PROPOSAL's `partyId` — a row on a
 *    customer's timeline saying we emailed her a message she never received.
 * 2. THE CARD ALWAYS REVIEWS THE CURRENT DRAFT. A re-proposal replaces the
 *    payload under the same assist id; the card was keyed on the id alone, so
 *    it kept the first draft (and the resolver's closure kept the first
 *    payload) while the row headline showed the new one.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ApprovalItem, ApprovalScope } from "@/features/approvals/types";

type Resolver = (response: {
  confirmed?: boolean;
  data?: unknown;
}) => void;

const resolvers = new Map<string, Resolver>();
/** The one argument the kind passes `recordGmailSendInteraction`, as far as
 * these tests read it. Typed so `mock.calls` is typed too — a cast there is how
 * a test starts asserting about a shape the code does not pass. */
type RecordInteractionArgs = {
  association: { partyId: string; contactPointId: string | null };
};
const mockRecordInteraction = jest.fn(
  async (_args: RecordInteractionArgs) => ({ failure: null }),
);
const warnings: string[] = [];
let proposalPayload: Record<string, unknown>;

jest.mock("@tanstack/react-query", () => {
  const actual = jest.requireActual("@tanstack/react-query");
  return actual;
});
jest.mock("../data", () => ({
  listPendingProposals: async () => ({
    proposals: [
      {
        assist: {
          id: "assist-1",
          title: "Email to sam@example.com",
          createdAt: "2026-09-17T10:00:00Z",
        },
        proposalKind: "gmail_send",
        mode: "mode_4",
        autoApplyAt: null,
        proposerLabel: "the CRM follow-up agent",
        proposerAgentId: "a1",
        proposerRunId: "r1",
        operatorUserId: "u1",
        payload: proposalPayload,
        blocked: null,
        subject: null,
      },
    ],
    total: 1,
  }),
  recordApprovalDecision: jest.fn(async () => undefined),
}));
jest.mock("@/features/crm/compliance/service", () => ({
  checkSendEligibility: async () => ({ allowed: true, blocks: [] }),
}));
jest.mock("@/features/crm/gmail/service", () => ({
  narrowGmailSendReceipt: (data: unknown, connectionId: string) => {
    const row = data as Record<string, unknown>;
    return {
      messageId: String(row.message_id),
      connectionId,
      to: String(row.to),
      cc: [],
      subject: "s",
      body: "b",
      fromEmail: null,
      sentAt: "2026-09-17T10:05:00Z",
    };
  },
  recordGmailSendInteraction: (...args: unknown[]) =>
    mockRecordInteraction(...(args as [RecordInteractionArgs])),
}));
jest.mock("@/features/agents/ui-first-tools/redux/ask-resolver-registry", () => ({
  registerAskResolver: (callId: string, resolver: Resolver) => {
    resolvers.set(callId, resolver);
  },
}));
jest.mock("@/features/google-workspace/agent/GmailReviewCard", () => ({
  GmailReviewCard: ({ ask }: { ask: { email: { to: string } } }) => (
    <div>CARD to {ask.email.to}</div>
  ),
}));
jest.mock("@/components/official/entity-ref/EntityRef", () => ({
  EntityRef: () => null,
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: () => "u1",
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    warning: (message: string) => warnings.push(message),
    error: (message: string) => warnings.push(message),
    success: () => undefined,
    info: () => undefined,
  },
}));

// eslint-disable-next-line import/first -- after the mocks above
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// eslint-disable-next-line import/first -- after the mocks above
import { gmailSendKind } from "../kinds/gmail-send";

const scope: ApprovalScope = { key: "u1", organizationId: "o1", userId: "u1" };

function payload(overrides: Record<string, unknown> = {}) {
  return {
    __kind: "gmail_send_proposal",
    connectionId: "c1",
    fromEmail: "me@example.com",
    to: "sam@example.com",
    cc: [],
    subject: "Following up",
    body: "Hello Sam",
    recipientMediumId: "medium-1",
    partyId: "party-1",
    organizationId: "org-1",
    contactPointId: "cp-1",
    ...overrides,
  };
}

/** Renders the real source hook and hands its items out. */
function Harness({ onItems }: { onItems: (items: ApprovalItem[]) => void }) {
  const source = gmailSendKind.useSource(scope);
  onItems(source.items);
  return <>{source.items.map((item) => item.individualReview ?? null)}</>;
}

const flush = async () => {
  for (let i = 0; i < 12; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

describe("gmail_send: the recipient on the card is the recipient of the record", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ApprovalItem[] = [];

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    resolvers.clear();
    warnings.length = 0;
    mockRecordInteraction.mockClear();
    proposalPayload = payload();
    latest = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <Harness
            onItems={(items) => {
              latest = items;
            }}
          />
        </QueryClientProvider>,
      );
    });
    await flush();
  };

  it("writes the sent record when the approver sent it to the proposed address", async () => {
    await render();
    const resolve = resolvers.get("approval:assist-1");
    expect(resolve).toBeDefined();

    await act(async () => {
      resolve?.({
        confirmed: true,
        data: { message_id: "m1", to: "sam@example.com" },
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();

    expect(mockRecordInteraction).toHaveBeenCalledTimes(1);
    const call = mockRecordInteraction.mock.calls[0]?.[0];
    expect(call?.association.partyId).toBe("party-1");
    expect(call?.association.contactPointId).toBe("cp-1");
  });

  it("records a changed recipient on NO record, and says so with the address", async () => {
    await render();
    const resolve = resolvers.get("approval:assist-1");

    await act(async () => {
      // The approver retyped `to` on the card before pressing Send.
      resolve?.({
        confirmed: true,
        data: { message_id: "m2", to: "someone.else@example.com" },
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();

    expect(mockRecordInteraction).not.toHaveBeenCalled();
    const said = warnings.join(" ");
    expect(said).toContain("someone.else@example.com");
    expect(said).toContain("not added to any record's timeline");
    expect(said).toContain("by hand");
  });

  it("gives the card a new identity when the same proposal is re-proposed", async () => {
    await render();
    const firstKey = (latest[0]?.individualReview as React.ReactElement | null)
      ?.key;
    expect(firstKey).toBeTruthy();
    expect(container.textContent).toContain("CARD to sam@example.com");

    // Same assist id, new draft — what a re-proposal under one dedupe key does.
    act(() => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    proposalPayload = payload({ to: "newsam@example.com", subject: "Take 2" });
    await render();

    const secondKey = (latest[0]?.individualReview as React.ReactElement | null)
      ?.key;
    expect(secondKey).toBeTruthy();
    // The key IS the remount: a card keyed only on the assist id would keep the
    // first draft in its own editable state while the row showed the new one.
    expect(secondKey).not.toBe(firstKey);
    expect(container.textContent).toContain("CARD to newsam@example.com");
  });
});
