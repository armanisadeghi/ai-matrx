/**
 * FORCING TESTS — ONE PARSER FOR A RECIPIENT FIELD, AND THE RECORD IS WHAT
 * GOOGLE ACTUALLY GOT.
 *
 * Two findings, one card.
 *
 * 1. **F-20 flagged this seam:** `GmailReviewCard` kept a PRIVATE
 *    `parseAddressList` that split Cc on every comma. A Cc written the way every
 *    mail client prints it — `"Doe, John" <john@x.com>` — therefore reached the
 *    preflight as two unreadable pieces (`"Doe` and `John" <john@x.com>`), and the
 *    one send authority fails CLOSED on a field it cannot parse: the message was
 *    refused, in words that blamed the person's own address. `features/crm/gmail/
 *    mailbox.ts` is THE parser (`splitMailboxField` honours quotes and angle
 *    brackets), so the card uses it and the private copy is deleted. A genuinely
 *    unreadable field must STILL refuse — the fix is a correct parse, never a
 *    laxer gate.
 *
 * 2. **aidream lane B-10 (`/projects/google-native/VERIFY-B1-B2-R2.md` N2):**
 *    `POST /gmail/send-reviewed` now answers with the addresses it PARSED and
 *    delivered to (`to`, `cc`), because the CRM records the sent message against
 *    the Person holding the delivered address — and `Ada <ada@example.com>` was
 *    delivered to `ada@example.com` while the record was judged against the raw
 *    typed string, so a message to the open record's own address was recorded
 *    against nobody. The card resolved its ask with the TYPED strings, so every
 *    downstream reader (recipient integrity, the contact point, the row's
 *    metadata, the Cc attribution) saw the typed form. It now reports what the
 *    server says it delivered.
 *
 * 3. **The server now writes the sent record** (aidream `4dbffdffb`): the row, its
 *    association edges and the `crm.sending_event`. The browser writes none of it,
 *    so the ONLY account of whether the history is true is what this card does
 *    with `record_failure`, `sending_event_gap`, `association_failures` and
 *    `warnings` — and with the 409 the outbound authority answers when a
 *    recipient may not be contacted, where NOTHING was sent. Both are asserted
 *    below, on the real card, because a sentence that reaches only a variable is
 *    the same silence as no sentence at all.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EligibilityVerdict } from "@/features/crm/compliance/types";
import { preflightGmailRecipients } from "@/features/crm/gmail/preflight";

const mockSend = jest.fn();
const resolved: { callId: string; response: Record<string, unknown> }[] = [];

jest.mock("@/features/google-workspace/service", () => ({
  sendReviewedGmail: (...args: unknown[]) => mockSend(...args),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => () => undefined,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppStore: () => ({
    getState: () => ({}),
    dispatch: () => undefined,
    subscribe: () => () => undefined,
  }),
}));
/** The body editor brings a whole AI assist tree with it; the card's subject is
 *  the addresses, so it stands in as a plain textarea. */
jest.mock("@/components/official/ProTextarea", () => ({
  ProTextarea: (props: { value?: string }) => (
    <textarea defaultValue={props.value} />
  ),
}));
jest.mock("@/features/agents/ui-first-tools/redux/ask-resolver-registry", () => ({
  resolveAskByCallId: (callId: string, response: Record<string, unknown>) => {
    resolved.push({ callId, response });
  },
  cancelAskByCallId: () => undefined,
}));
jest.mock("@/features/marketing/google/hooks", () => ({
  useGoogleConnectionInventory: () => ({
    data: {
      connections: [
        {
          id: "conn-1",
          account_email: "me@example.com",
          granted_scopes: ["https://www.googleapis.com/auth/gmail.send"],
          status: "connected",
        },
      ],
    },
    isLoading: false,
  }),
}));
const toastWarnings: string[] = [];
const toastErrors: string[] = [];
jest.mock("@/lib/toast", () => ({
  toast: {
    warning: (message: string) => {
      toastWarnings.push(message);
    },
    success: () => undefined,
    error: (message: string) => {
      toastErrors.push(message);
    },
    info: () => undefined,
  },
}));
jest.mock("@/features/google-workspace/connection", () => ({
  eligibleGoogleConnections: (connections: { id: string }[]) => connections,
  preferredGoogleConnectionId: () => "conn-1",
  rememberGoogleConnection: () => undefined,
}));
jest.mock("@/features/google-workspace/GoogleAccountSelect", () => ({
  GoogleAccountSelect: () => null,
}));

// eslint-disable-next-line import/first -- after the mocks above
import { GmailReviewCard } from "./GmailReviewCard";
import type { ReviewedGmailSendOutcome } from "@/features/crm/gmail/reviewed-send-contract";

/** An `email_review` ask, as the agent surfaces one. */
function ask(cc: string[]) {
  return {
    callId: "call-1",
    conversationId: "conv-1",
    kind: "email_review",
    status: "pending",
    createdAtMs: Date.now(),
    email: {
      connectionId: "conn-1",
      fromEmail: "me@example.com",
      to: "Ada Lovelace <ada@example.com>",
      cc,
      subject: "Following up",
      body: "Hello there.",
    },
  } as unknown as Parameters<typeof GmailReviewCard>[0]["ask"];
}

/** Everything the gate asked about, in the order it asked. */
let asked: string[] = [];

/** THE REAL send authority, with the two database seams injected. */
const gate = (draft: {
  to: string;
  cc: string[];
  subject: string;
  body: string;
  connectionId: string;
}) =>
  preflightGmailRecipients({
    to: draft.to,
    cc: draft.cc,
    options: [],
    organizationId: "org-1",
    lookup: async (address: string) => {
      asked.push(address);
      return [`medium-for-${address}`];
    },
    check: async (): Promise<EligibilityVerdict> => ({
      allowed: true,
      lane: "cold_outreach",
      blocks: [],
      warnings: [],
      resolved: {
        jurisdiction: null,
        confidence: "none",
        method: "test",
        jurisdiction_verdict: null,
        jurisdiction_ratified: false,
        consent_basis: "none",
        subscriber_kind: "unknown",
      },
    }),
  });

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
  // jsdom has neither of these; the shell asks whether this is a phone and the
  // design-system input watches its own box.
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
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
});

beforeEach(() => {
  asked = [];
  resolved.length = 0;
  toastWarnings.length = 0;
  toastErrors.length = 0;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  mockSend.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function settle() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

/**
 * A complete narrowed outcome — every field the server answers with.
 *
 * The transport narrows the response before the card ever sees it, so a partial
 * object here would be a shape production cannot produce. Overrides carry the one
 * fact a test is about.
 */
function outcome(
  overrides: Partial<ReviewedGmailSendOutcome> = {},
): ReviewedGmailSendOutcome {
  return {
    messageId: "gmail-1",
    to: "ada@example.com",
    cc: ["john@x.com"],
    interactionId: "interaction-1",
    recordFailure: null,
    associationsWritten: ["party:party-1"],
    associationFailures: [],
    sendingEventId: "event-1",
    sendingEventGap: null,
    compliance: {
      envelope: false,
      footerAppended: false,
      reason: "A reviewed one-to-one message carries no unsubscribe footer.",
    },
    warnings: [],
    auditColumnsWritten: ["approved_by", "approved_at"],
    ...overrides,
  };
}

async function press(cc: string[], plan?: Parameters<typeof GmailReviewCard>[0]["plan"]) {
  await act(async () => {
    root.render(<GmailReviewCard ask={ask(cc)} preflight={gate} plan={plan} />);
  });
  const send = [...container.querySelectorAll("button")].find(
    (button) => (button.textContent ?? "").trim() === "Send",
  );
  if (!send) throw new Error("the card rendered no Send control");
  await act(async () => {
    send.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
  return { text: container.textContent ?? "" };
}

describe("there is ONE parser for a recipient field", () => {
  it("a Cc written `\"Doe, John\" <john@x.com>` is ONE recipient, and the send goes", async () => {
    mockSend.mockResolvedValue(outcome());
    const screen = await press(['"Doe, John" <john@x.com>']);
    // 🚨 The private splitter made two pieces, the gate could not read either,
    // and the card showed a refusal instead of sending.
    expect(screen.text).not.toMatch(/is not an email address/i);
    expect(mockSend).toHaveBeenCalledTimes(1);
    // The gate was asked about BOTH real people, once each.
    expect(asked.sort()).toEqual(["ada@example.com", "john@x.com"]);
    // And the field went to the server whole — the server parses it too.
    const sent = mockSend.mock.calls[0]?.[0] as { cc: string[] };
    expect(sent.cc).toEqual(['"Doe, John" <john@x.com>']);
  });

  it("a genuinely unreadable Cc still REFUSES — the parse got better, not laxer", async () => {
    const screen = await press(["not an address at all"]);
    expect(mockSend).not.toHaveBeenCalled();
    expect(screen.text.toLowerCase()).toContain("not an email address");
  });

  it("several addresses in one Cc field are each asked about", async () => {
    mockSend.mockResolvedValue(outcome({ cc: ["john@x.com", "sam@y.com"] }));
    await press(["john@x.com, sam@y.com"]);
    expect(asked.sort()).toEqual([
      "ada@example.com",
      "john@x.com",
      "sam@y.com",
    ]);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

describe("the ask reports what GOOGLE got, not what was typed", () => {
  it("resolves with the server's delivered addresses", async () => {
    // The server's parse: bare addresses, display names stripped.
    mockSend.mockResolvedValue(outcome());
    await press(['"Doe, John" <john@x.com>']);
    const data = resolved.at(-1)?.response.data as {
      message_id: string;
      to: string;
      cc: string[];
    };
    expect(data.message_id).toBe("gmail-1");
    // 🚨 N2: the typed form was `Ada Lovelace <ada@example.com>`, and a record
    // judged against that string matched no Person at all.
    expect(data.to).toBe("ada@example.com");
    expect(data.cc).toEqual(["john@x.com"]);
  });

  it("a server that answers no addresses falls back to the typed field, ANNOUNCED on screen (VERIFY-B1-B2-R4 V6)", async () => {
    // The service narrows a missing or blank `to` to `null` (and the card guards
    // a blank of its own accord), which is what an older server answers.
    mockSend.mockResolvedValue(outcome({ to: null, cc: null }));
    await press(["john@x.com"]);
    const data = resolved.at(-1)?.response.data as { to: string; cc: string[] };
    // Nothing is invented and nothing is blank: the person's own field stands in.
    expect(data.to).toBe("Ada Lovelace <ada@example.com>");
    expect(data.cc).toEqual(["john@x.com"]);
    // 🚨 LAW 4: the stand-in announces itself ON THE SCREEN THE PERSON IS
    // LOOKING AT, with the remedy — never only to devtools. Until 2026-09-17
    // this fired a bare `console.warn` that nothing on screen ever showed.
    expect(toastWarnings.length).toBeGreaterThan(0);
    expect(toastWarnings.join(" ")).toMatch(/did not confirm the delivered address/i);
    expect(toastWarnings.join(" ")).toMatch(/typed/i);
    expect(toastWarnings.join(" ")).toMatch(/refresh/i);
  });

  it("says nothing when the server DID confirm the delivered address", async () => {
    mockSend.mockResolvedValue(outcome());
    await press(["john@x.com"]);
    expect(toastWarnings).toEqual([]);
  });
});

describe("the card says what the SERVER recorded, and hides no gap", () => {
  it("shows the record failure — the message left and the timeline did not get it", async () => {
    mockSend.mockResolvedValue(
      outcome({
        interactionId: null,
        recordFailure:
          "The message was sent, but you do not have permission to add activity " +
          "to this record, so nothing was recorded. Log it by hand or ask " +
          "whoever owns the record to add it.",
        associationsWritten: [],
        sendingEventId: null,
        sendingEventGap:
          "No sending event was recorded either: an event row is filed against " +
          "the record's Person.",
      }),
    );
    await press(["john@x.com"]);
    // 🚨 The person is TOLD, in the sentence the server wrote, with its remedy.
    // A swallowed failure is how somebody sends the same message twice.
    expect(toastErrors.join(" ")).toMatch(/nothing was recorded/i);
    expect(toastErrors.join(" ")).toMatch(/log it by hand/i);
    // And the missing sending event — the row that correlates a bounce or a
    // complaint — is stated too, never silence.
    expect(toastWarnings.join(" ")).toMatch(/no sending event was recorded/i);
    // The ask still resolves with what happened, including the absent row.
    const data = resolved.at(-1)?.response.data as {
      interaction_id: string | null;
      record_failure: string | null;
    };
    expect(data.interaction_id).toBeNull();
    expect(data.record_failure).toMatch(/nothing was recorded/i);
  });

  it("shows a refused association edge and a recipient warning as their own sentences", async () => {
    mockSend.mockResolvedValue(
      outcome({
        associationFailures: [
          "The sent message was not linked to this deal: the association was refused.",
        ],
        warnings: ["This address has not been verified since March."],
      }),
    );
    await press(["john@x.com"]);
    const said = toastWarnings.join(" ");
    expect(said).toMatch(/not linked to this deal/i);
    expect(said).toMatch(/not been verified/i);
    // A missing link never reads as a failed send: the row IS true.
    expect(toastErrors).toEqual([]);
  });

  it("says the client could not attribute the recipient, and sends NO record fields", async () => {
    mockSend.mockResolvedValue(
      outcome({
        interactionId: null,
        recordFailure:
          "The message was sent, but the draft did not say which record it " +
          "belongs to, so nothing was added to a timeline. Log it by hand.",
      }),
    );
    await press(["john@x.com"], () => ({
      context: { organizationId: "org-1" },
      attributedAddress: null,
      unattributed:
        "The message was sent to stranger@elsewhere.com, which this record does " +
        "not hold, so it was not added to any record's timeline.",
    }));
    const sent = mockSend.mock.calls[0]?.[0] as {
      context: { partyId?: string | null; organizationId: string | null };
    };
    // 🚨 NO party on the wire means the server files NOTHING — which is the
    // point: a false row on a customer's history is a loss nobody can see.
    expect(sent.context.partyId).toBeUndefined();
    expect(sent.context.organizationId).toBe("org-1");
    expect(toastWarnings.join(" ")).toMatch(/which this record does not hold/i);
  });

  it("names a delivered address that disagrees with the one it was filed against", async () => {
    mockSend.mockResolvedValue(outcome({ to: "someone.else@example.com" }));
    await press(["john@x.com"], () => ({
      context: { organizationId: "org-1", partyId: "party-1" },
      attributedAddress: "ada@example.com",
      unattributed: null,
    }));
    // The browser cannot fix the row any more, so the disagreement is SAID.
    expect(toastWarnings.join(" ")).toMatch(/was recorded against ada@example.com/i);
  });

  it("is silent when the server recorded everything it should have", async () => {
    mockSend.mockResolvedValue(outcome());
    await press(["john@x.com"], () => ({
      context: { organizationId: "org-1", partyId: "party-1" },
      attributedAddress: "ada@example.com",
      unattributed: null,
    }));
    expect(toastWarnings).toEqual([]);
    expect(toastErrors).toEqual([]);
  });
});

describe("HTTP 409: the outbound authority refused a recipient and NOTHING was sent", () => {
  /** The canonical error the transport throws, as `parseHttpErrorBody` builds it. */
  function refusal() {
    return Object.assign(new Error("ada@example.com cannot be contacted right now."), {
      code: "gmail_send_refused",
      userMessage:
        "ada@example.com cannot be contacted right now. They asked us to stop " +
        "emailing them. Only they can reverse it.",
      status: 409,
      details: {
        address: "ada@example.com",
        field: "recipient",
        blocks: [
          {
            code: "unsubscribed",
            message: "They asked us to stop emailing them.",
            fix: "Only they can reverse it.",
          },
        ],
        remedy: "choose_a_different_recipient",
        sent: false,
      },
    });
  }

  it("renders the authority's own sentence and says nothing was sent", async () => {
    mockSend.mockRejectedValue(refusal());
    const screen = await press(["john@x.com"]);
    expect(screen.text).toContain("cannot be contacted right now");
    expect(screen.text).toContain("They asked us to stop emailing them.");
    expect(screen.text).toContain("Nothing was sent.");
    // Nothing was recorded and nothing resolved: the ask is still the person's.
    expect(resolved).toEqual([]);
  });

  it("prints a fix the sentence does not already carry, and never twice", async () => {
    const refused = refusal();
    // A server that stops concatenating the fixes into the sentence — the shape
    // this rendering exists for.
    refused.userMessage = "ada@example.com cannot be contacted right now.";
    mockSend.mockRejectedValue(refused);
    const screen = await press(["john@x.com"]);
    expect(screen.text).toContain("Only they can reverse it.");
    expect(
      screen.text.split("Only they can reverse it.").length - 1,
    ).toBe(1);
  });
});
