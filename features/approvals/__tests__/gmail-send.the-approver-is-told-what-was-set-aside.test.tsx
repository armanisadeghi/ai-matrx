/**
 * FORCING TEST — THE APPROVER OF A REVIEWED 1:1 IS TOLD WHAT THE AUTHORITY SAID
 * AND WHAT WILL BE ADDED TO THE BODY (VERIFY-B1-B2-R5 W3 + W4).
 *
 * Drives the REAL `gmail_send` kind, with only the network seams, the review card
 * and Redux stood in for, exactly as its sibling test does.
 *
 * Round 5's two silences:
 *
 *   W3 — `crm.check_send_eligibility` answers for a COLD CAMPAIGN when no list is
 *   named, so `jurisdiction_prohibited` ("Germany requires permission BEFORE you
 *   write, even for business email") fires on an ordinary reply. The spine
 *   EXEMPTS it, correctly, and kept nothing: not before the click, not after, not
 *   on the row. The verdict is `allowed: true` with an EMPTY `warnings` array, so
 *   the queue rendered nothing at all — measured here by asserting on that exact
 *   verdict shape.
 *
 *   W4 — when the send names a sending mailbox AND the recipient's medium, the
 *   spine appends an unsubscribe footer and a postal block to the body AFTER
 *   approval. §4.4 is that the reviewer sees what is sent.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ApprovalItem, ApprovalScope } from "@/features/approvals/types";

type Resolver = (response: { confirmed?: boolean; data?: unknown }) => void;
const resolvers = new Map<string, Resolver>();
let proposalPayload: Record<string, unknown>;
/** The verdict the ONE authority answers with, per test. */
let verdict: Record<string, unknown>;

jest.mock("../data", () => ({
  listPendingProposals: async () => ({
    proposals: [
      {
        assist: {
          id: "assist-1",
          title: "Email to ada@example.de",
          createdAt: "2026-09-18T10:00:00Z",
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
  checkSendEligibility: async () => verdict,
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
    warning: () => undefined,
    error: () => undefined,
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
    to: "ada@example.de",
    cc: [],
    subject: "Following up",
    body: "Hello Ada",
    recipientMediumId: "medium-1",
    partyId: "party-1",
    organizationId: "org-1",
    contactPointId: "cp-1",
    ...overrides,
  };
}

/** The verdict a reviewed 1:1 to a prohibited jurisdiction actually gets. */
const exemptJurisdictionVerdict = {
  allowed: true,
  lane: "cold_outreach",
  blocks: [
    {
      code: "jurisdiction_prohibited",
      message:
        "Germany requires permission BEFORE you write, even for business email.",
      fix: "Record express consent, or contact them another way.",
    },
    {
      code: "list_not_found",
      message: "This recipient is not on an outreach list.",
      fix: "Add them to a list.",
    },
  ],
  // 🚨 EMPTY. This is the shape the silence lived in.
  warnings: [],
};

function Harness({ onItems }: { onItems: (items: ApprovalItem[]) => void }) {
  const source = gmailSendKind.useSource(scope);
  onItems(source.items);
  return <>{source.items.map((item) => item.individualReview ?? null)}</>;
}

const flush = async () => {
  for (let index = 0; index < 12; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

describe("gmail_send: the exemption and the footer are disclosed before the click", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ApprovalItem[] = [];

  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    resolvers.clear();
    proposalPayload = payload();
    verdict = exemptJurisdictionVerdict;
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

  it("shows the jurisdiction rule the spine will set aside, and why", async () => {
    await render();
    // The row is still offered — the exemption is correct and the send proceeds.
    expect(latest).toHaveLength(1);
    expect(latest[0]!.blocked).toBeFalsy();
    const text = container.textContent ?? "";
    expect(text).toContain("CARD to ada@example.de");
    // W3: the authority's own sentence, and the declared reason it does not apply.
    expect(text).toContain(
      "Germany requires permission BEFORE you write, even for business email.",
    );
    expect(text).toContain(
      "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
    );
    // And the heading says what the section IS, not "warnings".
    expect(text).toContain(
      "Rules that would stop this as a campaign, and do not stop it as a reply",
    );
  });

  it("says nothing about a footer when no mailbox is named", async () => {
    await render();
    // W4's other direction: an ordinary 1:1 from a person's own mailbox has no
    // footer, and claiming one would be its own lie.
    expect(container.textContent ?? "").not.toContain("commercial message");
  });

  it("warns that a footer will be appended when a mailbox and medium are named", async () => {
    proposalPayload = payload({ identityId: "identity-1" });
    await render();
    const text = container.textContent ?? "";
    expect(text).toContain("counts as a commercial message");
    expect(text).toContain("after you approve it");
    // It names what arrives, because the body on screen is not what leaves.
    expect(text).toContain("What arrives is the body below plus that footer");
  });

  it("discloses nothing when the authority raised nothing", async () => {
    verdict = { allowed: true, lane: "cold_outreach", blocks: [], warnings: [] };
    await render();
    const text = container.textContent ?? "";
    expect(text).toContain("CARD to ada@example.de");
    // No empty reassurance box, no heading with nothing under it.
    expect(text).not.toContain(
      "Rules that would stop this as a campaign, and do not stop it as a reply",
    );
  });

  it("never presents a REFUSING block as a set-aside note", async () => {
    // An enforced recipient rule refuses the send; the queue must show the
    // refusal, not the disclosure. This is the dangerous direction of W3's fix.
    verdict = {
      allowed: false,
      lane: "cold_outreach",
      blocks: [
        {
          code: "unsubscribed",
          message: "This person asked us to stop emailing them.",
          fix: "Do not contact this address.",
        },
      ],
      warnings: [],
    };
    await render();
    expect(latest[0]!.blocked).toBeTruthy();
    const text = container.textContent ?? "";
    expect(text).toContain("This person asked us to stop emailing them.");
    expect(text).not.toContain("CARD to");
    expect(text).not.toContain(
      "Rules that would stop this as a campaign, and do not stop it as a reply",
    );
  });
});
