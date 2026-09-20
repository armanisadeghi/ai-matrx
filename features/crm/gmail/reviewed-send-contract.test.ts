// features/crm/gmail/reviewed-send-contract.test.ts
//
// The wire contract's own decisions, each one a thing a surface would otherwise
// get wrong in a way nobody sees:
//
//  * an absent optional field is OMITTED, never sent as an empty string (the
//    server's `min_length` fields refuse one, and `party_id: ""` would file the
//    row against nothing);
//  * a response without `message_id` is a REFUSAL, not a shrug: it is the only
//    field that says the message left;
//  * every gap the server reports becomes a sentence with a level, worst first,
//    because the message has already gone and nothing unsends it;
//  * a delivered address that disagrees with the one the row was filed against is
//    NAMED — the browser no longer writes the row and cannot correct it;
//  * the 409 is read off the canonical error shape, and its fixes are printed
//    only when the sentence does not already carry them.
//
// The cross-repo half — that these names are the server's — is
// `./reviewed-send-contract-is-the-servers.test.ts`.

import {
  deliveredAddressDisagreement,
  interactionIdOfSendData,
  narrowReviewedSendOutcome,
  reviewedSendNotices,
  reviewedSendOutcomeAsRecord,
  reviewedSendRefusalFixes,
  reviewedSendRefusalOf,
  reviewedSendRequestBody,
  type ReviewedGmailSendOutcome,
} from "./reviewed-send-contract";

const ORGANIZATION_ID = "5dc930e9-bd65-44a1-8369-af773f6e1a5b";

function serverAnswer(overrides: Record<string, unknown> = {}) {
  return {
    message_id: "gmail-1",
    to: "ada@example.com",
    cc: ["bo@example.com"],
    interaction_id: "interaction-1",
    record_failure: null,
    associations_written: ["party:party-1", "crm_deal:deal-1"],
    association_failures: [],
    sending_event_id: "event-1",
    sending_event_gap: null,
    // 🚨 THE DEFAULT ANSWER IS AN ORDINARY REVIEWED 1:1 — the class where the
    // spine appends NOTHING, which is what `compliance_report(envelope=None)`
    // returns. This fixture used to say `footer_appended: true` while the notices
    // test asserted an EMPTY notice list, so the one shape W4 is about — a footer
    // added after approval — was asserted to be silent.
    compliance: {
      envelope: false,
      footer_appended: false,
      reason: "This went out exactly as the reviewer approved it.",
      compliance_class: "correspondence",
      footer_text: null,
    },
    compliance_class: "correspondence",
    footer_text: null,
    exempted_blocks: [],
    bounce_correlation: "watched",
    bounce_correlation_note:
      "This mailbox's replies are read, so a bounce will be matched back to it.",
    warnings: [],
    audit_columns_written: ["approved_by", "approved_at"],
    ...overrides,
  };
}

describe("reviewedSendRequestBody", () => {
  it("always carries the organization and the explicit confirmation", () => {
    const body = reviewedSendRequestBody({
      connectionId: "conn-1",
      to: "ada@example.com",
      cc: ["bo@example.com"],
      subject: "Hi",
      body: "Hello",
      context: { organizationId: ORGANIZATION_ID },
    });
    expect(body).toMatchObject({
      connection_id: "conn-1",
      to: "ada@example.com",
      cc: ["bo@example.com"],
      subject: "Hi",
      body: "Hello",
      user_confirmed: true,
      organization_id: ORGANIZATION_ID,
    });
  });

  it("omits every optional field it was not given — never an empty string", () => {
    const body = reviewedSendRequestBody({
      connectionId: "conn-1",
      to: "ada@example.com",
      cc: [],
      subject: "Hi",
      body: "Hello",
      context: {
        organizationId: ORGANIZATION_ID,
        partyId: null,
        dealId: "",
        ccAttribution: [],
        draftedBy: { agentId: null, runId: null, label: null, assistId: null },
      },
    });
    for (const key of [
      "party_id",
      "deal_id",
      "project_id",
      "contact_point_id",
      "medium_id",
      "outreach_list_id",
      "identity_id",
      "account_email",
      "drafted_by_agent_id",
      "drafted_by_run_id",
      "drafted_by_label",
      "approval_assist_id",
      "cc_attribution",
    ]) {
      expect(Object.keys(body)).not.toContain(key);
    }
  });
});

describe("narrowReviewedSendOutcome", () => {
  it("reads the whole sent record the server reported", () => {
    const outcome = narrowReviewedSendOutcome(serverAnswer());
    expect(outcome).toEqual<ReviewedGmailSendOutcome>({
      messageId: "gmail-1",
      to: "ada@example.com",
      cc: ["bo@example.com"],
      interactionId: "interaction-1",
      recordFailure: null,
      associationsWritten: ["party:party-1", "crm_deal:deal-1"],
      associationFailures: [],
      sendingEventId: "event-1",
      sendingEventGap: null,
      compliance: {
        envelope: false,
        footerAppended: false,
        reason: "This went out exactly as the reviewer approved it.",
        complianceClass: "correspondence",
        footerText: null,
      },
      warnings: [],
      auditColumnsWritten: ["approved_by", "approved_at"],
      exemptedBlocks: [],
      bounceCorrelation: "watched",
      bounceCorrelationNote:
        "This mailbox's replies are read, so a bounce will be matched back to it.",
    });
  });

  it("refuses an answer with no message id, because that is the one fact that says it left", () => {
    expect(() => narrowReviewedSendOutcome({ to: "a@b.com" })).toThrow(
      /did not return a message id/i,
    );
    expect(() => narrowReviewedSendOutcome(null)).toThrow(/cannot read/i);
    expect(() => narrowReviewedSendOutcome("sent")).toThrow(/cannot read/i);
  });

  it("keeps 'nobody told me' distinct from 'nobody was Cc'd'", () => {
    // An older server answers neither field; `null` says so, and an empty list
    // says the server answered and there were no copies.
    expect(narrowReviewedSendOutcome({ message_id: "g" }).cc).toBeNull();
    expect(narrowReviewedSendOutcome({ message_id: "g" }).to).toBeNull();
    expect(
      narrowReviewedSendOutcome({ message_id: "g", to: "", cc: [] }).cc,
    ).toEqual([]);
    expect(narrowReviewedSendOutcome({ message_id: "g", to: "  " }).to).toBeNull();
  });

  it("treats a compliance answer with no reason as no answer at all", () => {
    // `compliance.reason` is the sentence; a shape without one would let a screen
    // print "no footer" with nothing saying why.
    const outcome = narrowReviewedSendOutcome(
      serverAnswer({ compliance: { envelope: true } }),
    );
    expect(outcome.compliance).toBeNull();
  });

  it("round-trips through the server's own spelling", () => {
    const answer = serverAnswer();
    const outcome = narrowReviewedSendOutcome(answer);
    expect(reviewedSendOutcomeAsRecord(outcome)).toEqual(answer);
    expect(interactionIdOfSendData(reviewedSendOutcomeAsRecord(outcome))).toBe(
      "interaction-1",
    );
    expect(interactionIdOfSendData({ interaction_id: null })).toBeNull();
    expect(interactionIdOfSendData("nope")).toBeNull();
  });
});

describe("reviewedSendNotices", () => {
  it("says the worst thing first and nothing it was not told", () => {
    const outcome = narrowReviewedSendOutcome(
      serverAnswer({
        interaction_id: null,
        record_failure: "The message was sent, but it could not be recorded.",
        sending_event_gap: "No sending event was recorded either.",
        association_failures: ["The sent message was not linked to this deal."],
        warnings: ["This address has not been verified since March."],
      }),
    );
    expect(reviewedSendNotices(outcome)).toEqual([
      {
        level: "error",
        sentence: "The message was sent, but it could not be recorded.",
      },
      { level: "warning", sentence: "No sending event was recorded either." },
      {
        level: "warning",
        sentence: "The sent message was not linked to this deal.",
      },
      {
        level: "warning",
        sentence: "This address has not been verified since March.",
      },
    ]);
  });

  it("is empty when the server recorded everything", () => {
    expect(reviewedSendNotices(narrowReviewedSendOutcome(serverAnswer()))).toEqual(
      [],
    );
  });

  /**
   * 🚨 W5 — A BOUNCE THAT WILL NEVER COME BACK. The `crm.sending_event` row now
   * exists for every reviewed send, so `sending_event_gap` is null exactly when
   * the mailbox is unwatched: the machinery LOOKS correlated and only
   * `bounce_correlation` says otherwise.
   */
  it("says a bounce from an unwatched mailbox will never be matched back", () => {
    const outcome = narrowReviewedSendOutcome(
      serverAnswer({
        bounce_correlation: "not_watched",
        bounce_correlation_note:
          "We do not read this mailbox, so a bounce will not be matched back to " +
          "this message automatically — watch the mailbox itself for a delivery " +
          "failure.",
      }),
    );
    expect(reviewedSendNotices(outcome)).toEqual([
      {
        level: "warning",
        sentence:
          "We do not read this mailbox, so a bounce will not be matched back to " +
          "this message automatically — watch the mailbox itself for a delivery " +
          "failure.",
      },
    ]);
  });

  it("still says it when the server sent the state with no sentence", () => {
    const outcome = narrowReviewedSendOutcome(
      serverAnswer({ bounce_correlation: "not_watched", bounce_correlation_note: "" }),
    );
    expect(reviewedSendNotices(outcome)[0]?.sentence).toMatch(
      /do not read this mailbox/i,
    );
  });

  it("says nothing about bounces when the mailbox IS watched or unstated", () => {
    expect(reviewedSendNotices(narrowReviewedSendOutcome(serverAnswer()))).toEqual(
      [],
    );
    // An older answer: no field at all is not a claim either way.
    const older = narrowReviewedSendOutcome({
      message_id: "g",
      compliance: null,
    });
    expect(older.bounceCorrelation).toBeNull();
    expect(reviewedSendNotices(older)).toEqual([]);
  });

  /**
   * 🚨 W4 / R24 — THE BODY SENT IS THE BODY APPROVED, or the person is told what
   * was added to it. `footer_appended` with the exact text is the whole point.
   */
  it("names the footer the spine appended after approval, with its text", () => {
    const outcome = narrowReviewedSendOutcome(
      serverAnswer({
        compliance: {
          envelope: true,
          footer_appended: true,
          reason: "This message went out through a registered outreach mailbox.",
          compliance_class: "commercial_outreach",
          footer_text: "\n\nThis is a commercial message. 1 Main St, Springfield.",
        },
        compliance_class: "commercial_outreach",
        footer_text: "\n\nThis is a commercial message. 1 Main St, Springfield.",
      }),
    );
    expect(outcome.compliance?.complianceClass).toBe("commercial_outreach");
    const notices = reviewedSendNotices(outcome);
    expect(notices).toHaveLength(1);
    expect(notices[0]!.sentence).toContain("registered outreach mailbox");
    expect(notices[0]!.sentence).toContain("after you approved it");
    expect(notices[0]!.sentence).toContain("This is a commercial message.");
  });

  it("says a footer was added even when the server did not send its text", () => {
    const outcome = narrowReviewedSendOutcome(
      serverAnswer({
        compliance: {
          envelope: true,
          footer_appended: true,
          reason: "Registered outreach mailbox.",
        },
      }),
    );
    expect(reviewedSendNotices(outcome)[0]!.sentence).toMatch(
      /exact text it added was not reported/i,
    );
  });
});

describe("the exempted blocks the authority raised (W3)", () => {
  it("reads each one with the authority's sentence and the declared reason", () => {
    const outcome = narrowReviewedSendOutcome(
      serverAnswer({
        exempted_blocks: [
          {
            code: "jurisdiction_prohibited",
            message:
              "Germany requires permission BEFORE you write, even for business email.",
            exempt_reason:
              "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
            field: "recipient",
            address: "ada@example.de",
          },
        ],
      }),
    );
    expect(outcome.exemptedBlocks).toEqual([
      {
        code: "jurisdiction_prohibited",
        message:
          "Germany requires permission BEFORE you write, even for business email.",
        exemptReason:
          "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
        field: "recipient",
        address: "ada@example.de",
      },
    ]);
    // And it survives into the receipt, in the server's own spelling.
    const record = reviewedSendOutcomeAsRecord(outcome);
    expect(record.exempted_blocks).toEqual([
      {
        code: "jurisdiction_prohibited",
        message:
          "Germany requires permission BEFORE you write, even for business email.",
        exempt_reason:
          "Cold-outreach jurisdiction rules judge a campaign, not a reply.",
        field: "recipient",
        address: "ada@example.de",
      },
    ]);
  });

  it("never drops a block for missing prose — it says the reason is missing", () => {
    const outcome = narrowReviewedSendOutcome(
      serverAnswer({ exempted_blocks: [{ code: "aup_not_accepted" }] }),
    );
    expect(outcome.exemptedBlocks).toHaveLength(1);
    expect(outcome.exemptedBlocks[0]!.exemptReason).toMatch(/did not say why/i);
    expect(outcome.exemptedBlocks[0]!.field).toBe("recipient");
  });

  it("is an empty list, never an invented one, on a shape it cannot read", () => {
    expect(
      narrowReviewedSendOutcome(serverAnswer({ exempted_blocks: "none" }))
        .exemptedBlocks,
    ).toEqual([]);
    expect(
      narrowReviewedSendOutcome(serverAnswer({ exempted_blocks: [{}, 3, null] }))
        .exemptedBlocks,
    ).toEqual([]);
  });
});

describe("deliveredAddressDisagreement", () => {
  const outcome = narrowReviewedSendOutcome(serverAnswer({ to: "Ada@Example.com" }));

  it("is silent when the delivered address is the attributed one, whatever the case", () => {
    // The corpus's own instruction: compare case-insensitively. The server keeps
    // the case that was typed; the browser lowercases for its medium lookup.
    expect(deliveredAddressDisagreement(outcome, "ada@example.com")).toBeNull();
  });

  it("names both addresses when they disagree", () => {
    const sentence = deliveredAddressDisagreement(outcome, "bo@example.com");
    expect(sentence).toContain("Ada@Example.com");
    expect(sentence).toContain("bo@example.com");
    expect(sentence).toMatch(/by hand/i);
  });

  it("says nothing when there is nothing to compare", () => {
    expect(deliveredAddressDisagreement(outcome, null)).toBeNull();
    expect(
      deliveredAddressDisagreement(
        narrowReviewedSendOutcome({ message_id: "g" }),
        "ada@example.com",
      ),
    ).toBeNull();
  });
});

describe("the 409 refusal", () => {
  const error = {
    code: "gmail_send_refused",
    userMessage:
      "ada@example.com cannot be contacted right now. They asked us to stop " +
      "emailing them. Only they can reverse it.",
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
  };

  it("is recognised by its code and nothing else", () => {
    expect(reviewedSendRefusalOf(error)?.address).toBe("ada@example.com");
    expect(reviewedSendRefusalOf({ code: "internal" })).toBeNull();
    expect(reviewedSendRefusalOf(new Error("network down"))).toBeNull();
    expect(reviewedSendRefusalOf(null)).toBeNull();
  });

  it("never invents 'nothing was sent' — it carries what the server said", () => {
    expect(reviewedSendRefusalOf(error)?.sent).toBe(false);
    const silent = { ...error, details: { ...error.details, sent: undefined } };
    expect(reviewedSendRefusalOf(silent)?.sent).toBe(false);
    const claimed = { ...error, details: { ...error.details, sent: true } };
    expect(reviewedSendRefusalOf(claimed)?.sent).toBe(true);
  });

  it("does not repeat a fix the sentence already carries", () => {
    expect(reviewedSendRefusalFixes(reviewedSendRefusalOf(error)!)).toEqual([]);
  });

  it("prints the fix when the sentence does NOT carry it", () => {
    const terse = {
      ...error,
      userMessage: "ada@example.com cannot be contacted right now.",
    };
    expect(reviewedSendRefusalFixes(reviewedSendRefusalOf(terse)!)).toEqual([
      "Only they can reverse it.",
    ]);
  });

  it("keeps a block it cannot fully read, rather than dropping the refusal", () => {
    const partial = {
      ...error,
      userMessage: "Refused.",
      details: { ...error.details, blocks: [{ code: "mx_missing" }] },
    };
    const refusal = reviewedSendRefusalOf(partial)!;
    expect(refusal.blocks[0]!.code).toBe("mx_missing");
    expect(refusal.blocks[0]!.message).toMatch(/cannot be contacted/i);
    expect(reviewedSendRefusalFixes(refusal)).toEqual([
      "Choose a different recipient.",
    ]);
  });
});
