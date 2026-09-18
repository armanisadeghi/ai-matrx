// features/crm/sending-identities/purpose.test.ts
//
// THE READ SURFACES KNOW ABOUT `purpose` — proven on the states the first real
// reviewed send actually produces (VERIFY-B1-B2-R5 W1).
//
// The row the spine creates is `status='draft'`, `domain_verified=false`, no
// SPF/DKIM/DMARC, `purpose='correspondence'`. Every assertion below is written
// against THAT row, because it is the one the page was getting wrong: it read
// "Not set up — you have not proven you own this domain yet", forever, about a
// gmail.com address.
//
// The sentences these assertions pin are the SERVER's (`PURPOSE_NOTES`,
// `promotion_note`), measured against its source by
// `./purpose-is-the-servers.test.ts`.

import type { SendingIdentityView } from "./types";
import {
  CONNECT_CORRESPONDENCE_FALLBACK_SENTENCE,
  DEFAULT_PURPOSE_FILTER,
  PROMOTE_TO_CAMPAIGNS_CONSEQUENCE,
  connectableStateOf,
  correspondenceRevealLabel,
  correspondenceRowSentence,
  isCorrespondenceMailbox,
  purposeOf,
} from "./purpose";

/**
 * The fields of a real list row these functions read — taken from
 * `SendingIdentityView` itself, so a rename on the server is a compile error here
 * instead of a fixture that agrees only with this test. `purpose` and
 * `purpose_note` are optional on that type (the committed OpenAPI contract
 * predates them; see `./types.ts`), which is what lets the pre-B-26 row below be
 * the real absence rather than a cast.
 */
type PurposeRow = Pick<
  SendingIdentityView,
  "id" | "from_address" | "status" | "domain_verified" | "purpose" | "purpose_note"
>;

/** Exactly what `ensure_correspondence_identity` writes, as the view reads it. */
const correspondenceRow: PurposeRow = {
  id: "identity-corr",
  from_address: "ada@gmail.com",
  status: "draft",
  domain_verified: false,
  purpose: "correspondence",
  purpose_note:
    "Recorded for audit because reviewed one-to-one messages were sent from it. " +
    "It is not set up to run campaigns, and we do not read it.",
};

/** A pre-B-26 row: the field is simply not there. */
const preB26Row: PurposeRow = {
  id: "identity-old",
  from_address: "sales@acme.com",
  status: "draft",
  domain_verified: false,
};

describe("purpose, read off the row", () => {
  it("recognises the row a reviewed send creates", () => {
    expect(purposeOf(correspondenceRow)).toBe("correspondence");
    expect(isCorrespondenceMailbox(correspondenceRow)).toBe(true);
  });

  it("is null — never a guess — when the server declared no purpose", () => {
    expect(purposeOf(preB26Row)).toBeNull();
    expect(isCorrespondenceMailbox(preB26Row)).toBe(false);
    expect(purposeOf({ purpose: "" })).toBeNull();
    expect(purposeOf({ purpose: null })).toBeNull();
    // Not a purpose this client knows: treated as not-correspondence, so the
    // surface renders the ordinary outreach row rather than a made-up state.
    expect(purposeOf({ purpose: "transactional" })).toBeNull();
  });
});

describe("the list", () => {
  it("asks the server for outreach mailboxes, explicitly", () => {
    // 🚨 THE FILTER IS THE FIX (W1) and it lives on the server. The page states
    // the purpose it wants rather than relying on a default it never names.
    expect(DEFAULT_PURPOSE_FILTER).toBe("outreach");
  });

  it("says what a correspondence row IS, in the server's words, naming it", () => {
    const sentence = correspondenceRowSentence(correspondenceRow);
    expect(sentence).toContain("ada@gmail.com");
    // Not `?? ""` — that would pass trivially if the fixture lost its note, which
    // is the one thing this assertion exists to check.
    const note = correspondenceRow.purpose_note;
    if (typeof note !== "string") {
      throw new Error("the fixture must carry the server's purpose note");
    }
    expect(sentence).toContain(note);
    // 🚨 NEVER the permanent red demand this defect was named for.
    expect(sentence).not.toMatch(/prove you own|publish|DNS|TXT record/i);
  });

  it("falls back to the same meaning when a row carries no note", () => {
    const sentence = correspondenceRowSentence({
      from_address: "ada@gmail.com",
    });
    expect(sentence).toContain("Recorded for audit");
    expect(sentence).not.toMatch(/prove you own|publish|DNS|TXT record/i);
  });

  it("labels the reveal with what it holds and how many", () => {
    expect(correspondenceRevealLabel(1)).toBe(
      "Show 1 mailbox recorded for audit",
    );
    expect(correspondenceRevealLabel(3)).toBe(
      "Show 3 mailboxes recorded for audit",
    );
    // Before the second read has happened the count is unknown — and the control
    // still says what it opens rather than showing a bare or fake number.
    expect(correspondenceRevealLabel(null)).toBe(
      "Show mailboxes recorded for audit",
    );
  });

  it("states the consequence of promotion before the verb", () => {
    // The three things that turn on, each named — domain ownership, warm-up, and
    // reading the mailbox's incoming mail.
    expect(PROMOTE_TO_CAMPAIGNS_CONSEQUENCE).toMatch(/DNS record/);
    expect(PROMOTE_TO_CAMPAIGNS_CONSEQUENCE).toMatch(/warms up/);
    expect(PROMOTE_TO_CAMPAIGNS_CONSEQUENCE).toMatch(/reading its incoming mail/);
    // And it says what is NOT lost, because a person may not press it otherwise.
    expect(PROMOTE_TO_CAMPAIGNS_CONSEQUENCE).toMatch(/stay exactly as they are/);
  });
});

describe("the connect-mailbox dialog", () => {
  it("offers a mailbox recorded for audit its promotion, in the server's words", () => {
    const state = connectableStateOf({
      can_send: true,
      already_used: false,
      recorded_for_audit: true,
      promotion_note: CONNECT_CORRESPONDENCE_FALLBACK_SENTENCE,
    });
    expect(state).toEqual({
      kind: "recorded_for_audit",
      sentence: CONNECT_CORRESPONDENCE_FALLBACK_SENTENCE,
    });
    expect(state.kind === "recorded_for_audit" && state.sentence).not.toMatch(
      /already set up as a sending identity/i,
    );
  });

  it("is still that state when the server sent no note", () => {
    const state = connectableStateOf({ can_send: true, recorded_for_audit: true });
    expect(state.kind).toBe("recorded_for_audit");
    if (state.kind !== "recorded_for_audit") throw new Error("unreachable");
    expect(state.sentence).toBe(CONNECT_CORRESPONDENCE_FALLBACK_SENTENCE);
  });

  it("still blocks a real campaign mailbox's own connection", () => {
    const state = connectableStateOf({
      can_send: false,
      already_used: true,
      recorded_for_audit: false,
      blocked_reason: "This mailbox is already set up as a sending identity.",
    });
    expect(state).toEqual({
      kind: "blocked",
      sentence: "This mailbox is already set up as a sending identity.",
    });
  });

  it("prints the server's own reason for any other refusal", () => {
    expect(
      connectableStateOf({
        can_send: false,
        blocked_reason: "This Google account is revoked. Reconnect it.",
      }),
    ).toEqual({
      kind: "blocked",
      sentence: "This Google account is revoked. Reconnect it.",
    });
  });

  it("never renders a silent block when the server gave no reason", () => {
    const state = connectableStateOf({ can_send: false });
    expect(state.kind).toBe("blocked");
    if (state.kind !== "blocked") throw new Error("unreachable");
    expect(state.sentence).toMatch(/did not say why/);
  });

  it("leaves a usable mailbox usable", () => {
    expect(connectableStateOf({ can_send: true })).toEqual({
      kind: "connectable",
    });
  });
});
