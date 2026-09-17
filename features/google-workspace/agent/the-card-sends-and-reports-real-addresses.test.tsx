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
      blocks: [],
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

async function press(cc: string[]) {
  await act(async () => {
    root.render(<GmailReviewCard ask={ask(cc)} preflight={gate} />);
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
    mockSend.mockResolvedValue({
      messageId: "gmail-1",
      to: "ada@example.com",
      cc: ["john@x.com"],
    });
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
    mockSend.mockResolvedValue({
      messageId: "gmail-1",
      to: "ada@example.com",
      cc: ["john@x.com", "sam@y.com"],
    });
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
    mockSend.mockResolvedValue({
      messageId: "gmail-1",
      // The server's parse: bare addresses, display names stripped.
      to: "ada@example.com",
      cc: ["john@x.com"],
    });
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

  it("a server that answers no addresses falls back to the typed field, loudly", async () => {
    const warnings: string[] = [];
    jest
      .spyOn(console, "warn")
      .mockImplementation((...args: unknown[]) =>
        warnings.push(args.map(String).join(" ")),
      );
    // The service narrows a missing or blank `to` to `null` (and the card guards
    // a blank of its own accord), which is what an older server answers.
    mockSend.mockResolvedValue({ messageId: "gmail-1", to: null, cc: null });
    await press(["john@x.com"]);
    const data = resolved.at(-1)?.response.data as { to: string; cc: string[] };
    // Nothing is invented and nothing is blank: the person's own field stands in.
    expect(data.to).toBe("Ada Lovelace <ada@example.com>");
    expect(data.cc).toEqual(["john@x.com"]);
    // A stand-in ANNOUNCES ITSELF, with what to do about it.
    expect(warnings.join(" ")).toMatch(/send-reviewed/i);
    jest.restoreAllMocks();
  });
});
