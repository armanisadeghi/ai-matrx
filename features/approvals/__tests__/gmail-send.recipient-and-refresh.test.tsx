/**
 * FORCING TESTS for the two `gmail_send` findings Bugbot raised on frontend
 * PR 228. Both drive the REAL kind (`../kinds/gmail-send`); only the network
 * seams, the review card and Redux are stood in for.
 *
 * 🚨 WHAT THE KIND DOES WITH THE RECORD CHANGED, THE RULE DID NOT. The server now
 * writes the `crm.interaction` row, its edges and the sending event (aidream
 * `4dbffdffb`), so this kind no longer calls a browser writer: it hands the card
 * a PLAN — the record context that goes ON THE REQUEST — decided from the
 * recipients on the card at the click. So these tests drive that plan, which is
 * the thing the row is now built from.
 *
 * 1. A CHANGED RECIPIENT IS RECORDED ON NO PERSON. The approver can edit `to`
 *    right up to Send. The plan used to drop only the contact point and still
 *    name the PROPOSAL's `partyId` — a row on a customer's timeline saying we
 *    emailed her a message she never received.
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
/**
 * The `plan` each mounted card was handed, by ask id. Calling it is exactly what
 * the real card does immediately before it posts, with the fields on its own
 * screen — so a test asks the kind the same question the send does.
 */
const plans = new Map<string, PlanFor>();
type PlanFor = (draft: { to: string; cc: string[] }) => {
  context: {
    organizationId: string | null;
    partyId?: string | null;
    contactPointId?: string | null;
    ccAttribution?: {
      address: string;
      contactPointId: string | null;
      mediumId: string | null;
      heldByThisRecord: boolean;
    }[];
    draftedBy?: { agentId: string | null; assistId: string | null } | null;
  };
  attributedAddress: string | null;
  unattributed: string | null;
};
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

jest.mock("@/features/agents/ui-first-tools/redux/ask-resolver-registry", () => ({
  registerAskResolver: (callId: string, resolver: Resolver) => {
    resolvers.set(callId, resolver);
  },
}));
jest.mock("@/features/google-workspace/agent/GmailReviewCard", () => ({
  GmailReviewCard: ({
    ask,
    plan,
  }: {
    ask: { callId: string; email: { to: string } };
    plan?: PlanFor;
  }) => {
    if (plan) plans.set(ask.callId, plan);
    return <div>CARD to {ask.email.to}</div>;
  },
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
    // The DESCRIPTION is captured too: half of what a person is told lives
    // there (what to do about it), and a test blind to it cannot assert the
    // remedy was said.
    warning: (message: string, options?: { description?: string }) =>
      warnings.push(`${message} ${options?.description ?? ""}`),
    error: (message: string, options?: { description?: string }) =>
      warnings.push(`${message} ${options?.description ?? ""}`),
    success: () => undefined,
    info: () => undefined,
  },
}));

// eslint-disable-next-line import/first -- after the mocks above
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// eslint-disable-next-line import/first -- after the mocks above
import { gmailSendKind } from "../kinds/gmail-send";

const scope: ApprovalScope = { key: "u1", organizationId: "o1", userId: "u1" };

/**
 * The ask id registered for the draft ON SCREEN. It carries the payload's
 * fingerprint, so a re-proposal is a different identity (Bugbot round 9 #8) —
 * which is why a test may not hard-code `approval:assist-1`. Read from the
 * registry rather than recomputed: the kind narrows the payload before
 * fingerprinting it, and a test that re-derived the hash would be asserting
 * about its own arithmetic.
 */
const registeredCallIds = () =>
  [...resolvers.keys()].filter((key) => key.startsWith("approval:assist-1:"));
const currentCallId = () => {
  const ids = registeredCallIds();
  expect(ids).toHaveLength(1);
  return ids[0] as string;
};

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
    plans.clear();
    warnings.length = 0;
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

  it("files the record on the proposal's party when the approver sent it there", async () => {
    await render();
    const callId = currentCallId();
    expect(resolvers.get(callId)).toBeDefined();
    const plan = plans.get(callId);
    expect(plan).toBeDefined();

    const planned = plan!({ to: "sam@example.com", cc: [] });
    expect(planned.unattributed).toBeNull();
    expect(planned.context.partyId).toBe("party-1");
    expect(planned.context.contactPointId).toBe("cp-1");
    expect(planned.context.organizationId).toBe("org-1");
    expect(planned.attributedAddress).toBe("sam@example.com");
    // WHO DRAFTED IT is what this path uniquely knows — carried as a hint the
    // server re-reads off the approval row and overrules if it disagrees.
    expect(planned.context.draftedBy?.agentId).toBe("a1");
    expect(planned.context.draftedBy?.assistId).toBe("assist-1");
  });

  /**
   * 🚨 A Cc IS A RECIPIENT ON THIS PATH TOO. The compose panel attributed every
   * copied-to address onto the row (VERIFY-B1-B2-R2 N9 / break D) and this one
   * did not pass `sentCc` at all, so an agent-proposed send put a second
   * customer's address on a Person's timeline with nothing saying whose it was.
   * One primitive, both paths, same answer.
   */
  it("attributes every Cc on the card, held or not", async () => {
    await render();
    const planned = plans.get(currentCallId())!({
      to: "sam@example.com",
      cc: ["stranger@elsewhere.com"],
    });
    expect(planned.context.ccAttribution).toEqual([
      {
        address: "stranger@elsewhere.com",
        contactPointId: null,
        mediumId: null,
        heldByThisRecord: false,
      },
    ]);
  });

  it("sends NO record fields for a changed recipient, and says so with the address", async () => {
    await render();
    // The approver retyped `to` on the card before pressing Send.
    const planned = plans.get(currentCallId())!({
      to: "someone.else@example.com",
      cc: [],
    });
    // 🚨 No party on the wire means the server files nothing — and the sentence
    // the card shows names the address so a human can log it in the right place.
    expect(planned.context.partyId).toBeUndefined();
    expect(planned.attributedAddress).toBeNull();
    expect(planned.unattributed).toContain("someone.else@example.com");
    expect(planned.unattributed).toContain("not added to any record's timeline");
    expect(planned.unattributed).toContain("by hand");
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

/**
 * FORCING TEST for Bugbot round 9, finding 8: AN IN-FLIGHT SEND MUST NOT RESOLVE
 * THE NEXT DRAFT'S RESOLVER.
 *
 * The ask-resolver registry is keyed by call id and `registerAskResolver`
 * overwrites. With the call id built from the assist id alone, a re-proposal
 * under the same dedupe key registered the NEW card's resolver under the SAME
 * key — so a Send already in flight from the old card resolved it and the new
 * draft was recorded as approved, with the old send's receipt, for a message
 * that was never sent.
 */
describe("gmail_send: one ask identity per proposal VERSION", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    resolvers.clear();
    plans.clear();
    warnings.length = 0;
    proposalPayload = payload();
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
          <Harness onItems={() => undefined} />
        </QueryClientProvider>,
      );
    });
    await flush();
  };

  it("gives each draft its own call id, and the old one records nothing", async () => {
    await render();
    const firstId = currentCallId();

    // The same assist, re-proposed with a new draft.
    act(() => root.unmount());
    container.remove();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    proposalPayload = payload({ to: "newsam@example.com", subject: "Take 2" });
    await render();

    // Both ids are now registered: the new card's real resolver, and the old
    // id's REFUSAL left behind by the unmounted version.
    const ids = registeredCallIds();
    expect(ids).toHaveLength(2);
    const secondId = ids.find((id) => id !== firstId) as string;
    expect(secondId).toBeDefined();

    // Now the OLD card's Send lands. It must not be recorded against the new
    // draft — and it must not vanish silently either.
    await act(async () => {
      resolvers.get(firstId)?.({
        confirmed: true,
        data: { message_id: "m-old", to: "sam@example.com" },
      });
      await new Promise((r) => setTimeout(r, 0));
    });
    await flush();

    // The superseded version records NOTHING and says so — and the plan the
    // replaced card was holding is gone with it, so no record context could be
    // built from it either.
    const said = warnings.join(" ");
    expect(said).toContain("since replaced");
    expect(said).toContain("by hand");
  });
});
