// features/crm/gmail/reviewed-send-contract.ts
//
// 🚨 THE WIRE CONTRACT OF `POST /google-workspace/gmail/send-reviewed`, AND THE
// REASON THIS FILE EXISTS INSTEAD OF A GENERATED TYPE.
//
// The generated contract (`types/python-generated/api-types.ts`) still carries
// the PRE-SPINE shape of this endpoint — a request of five fields and a response
// of `message_id` alone. The server it is generated from moved the whole sent
// record onto the outbound spine (aidream `4dbffdffb`): `organization_id` is now
// REQUIRED, fifteen more request fields exist, and the response carries the row,
// the edges, the sending event and the compliance envelope. Regeneration is OWED
// and could not run in this container:
//
//   pnpm sync-types  →  step 1 `pnpm db-types` fails:
//     LegacyPlatformAuthRequiredError: Access token not provided. Supply an
//     access token by running `supabase login` or setting SUPABASE_ACCESS_TOKEN.
//   the same contract direct from the checkout
//   (`cd ../aidream && uv run python scripts/generate_types.py all --direct`) fails:
//     MATRX_STAGE is not set  →  DatabaseConfigError: Cannot alias
//     'matrx_scraper' to 'supabase_automation_matrix': target is not a
//     registered database
//
// A generated file is NEVER hand-edited (`pnpm check:api-types-fresh` refuses
// one), so the shape lives here, in the feature, until a session with database
// environment runs `pnpm sync-types` — at which point this module becomes a thin
// camelCase adapter over `components["schemas"]["ReviewedGmailRequest"]` and
// `…["ReviewedGmailResponse"]` and nothing else changes.
//
// 🚨 AND IT CANNOT DRIFT IN SILENCE: `./reviewed-send-contract-is-the-servers.test.ts`
// reads the Pydantic models out of the sibling aidream checkout and FAILS when a
// field this module sends or reads is not on the server's model (and prints
// UNMEASURED, never a quiet pass, when the checkout is absent).
//
// Pure: no React, no Supabase, no network. The transport is
// `features/google-workspace/service.ts::sendReviewedGmail`.

/** Whose address one copied-to recipient is — the client's ONE decision (N9). */
export interface ReviewedGmailCcAttribution {
  address: string;
  contactPointId: string | null;
  mediumId: string | null;
  heldByThisRecord: boolean;
}

/** Present only when an AGENT wrote the draft; a person's compose leaves it null. */
export interface ReviewedGmailDraftedBy {
  agentId: string | null;
  runId: string | null;
  label: string | null;
  /** The approval-queue row the decision was recorded in. */
  assistId: string | null;
}

/**
 * WHERE THE SERVER FILES THE SENT RECORD, and what it associates it with.
 *
 * 🚨 `organizationId` IS REQUIRED and it is the PARTY's own organization — the
 * suppression, complaint and blocklist rows the one authority reads live on that
 * organization's `crm.contact_medium` rows, and `crm._inherit_parent_org` RAISES
 * on any other value. A send with no record (an agent asking to email an address
 * nobody in the CRM holds, the admin bench) carries the viewer's own
 * organization context instead, resolved through the ONE fail-closed kernel by
 * the transport — never a default, never a guess.
 *
 * A send that names no `partyId` is still GATED; it is simply recorded nowhere,
 * and the server says so in `recordFailure` rather than inventing a timeline.
 */
export interface ReviewedGmailSendContext {
  organizationId: string | null;
  partyId?: string | null;
  dealId?: string | null;
  /** Carried, never a column — a CRM table may not depend on a project FK. */
  projectId?: string | null;
  contactPointId?: string | null;
  mediumId?: string | null;
  outreachListId?: string | null;
  identityId?: string | null;
  ccAttribution?: ReviewedGmailCcAttribution[];
  /** The address the connection sends from, stored on the row for the reader. */
  accountEmail?: string | null;
  draftedBy?: ReviewedGmailDraftedBy | null;
}

/** The bytes on the review card, plus where the record goes. */
export interface ReviewedGmailSendRequest {
  connectionId: string;
  to: string;
  cc: string[];
  subject: string;
  body: string;
  context: ReviewedGmailSendContext;
}

/**
 * Every field this client SENDS, in the server's own spelling. The drift test
 * diffs this list against `ReviewedGmailRequest`, so a field the server renames
 * or drops fails here instead of 422-ing a person's send.
 */
export const REVIEWED_SEND_REQUEST_FIELDS = [
  "connection_id",
  "to",
  "cc",
  "subject",
  "body",
  "user_confirmed",
  "organization_id",
  "party_id",
  "deal_id",
  "project_id",
  "contact_point_id",
  "medium_id",
  "outreach_list_id",
  "identity_id",
  "cc_attribution",
  "account_email",
  "drafted_by_agent_id",
  "drafted_by_run_id",
  "drafted_by_label",
  "approval_assist_id",
] as const;

/**
 * 🚨 NEVER SENT, AND THE DRIFT TEST PROVES THE SERVER STILL REFUSES IT. The
 * approver is whoever the request is authenticated as — the review card IS the
 * authorization — so a body claiming `approved_by` would be a client asserting
 * who approved a send. Drafted-by is read off the approval row when
 * `approval_assist_id` is sent; what this client passes is a hint the ROW
 * overrules.
 */
export const REVIEWED_SEND_REQUEST_FORBIDDEN_FIELDS = ["approved_by"] as const;

/** Every field this client READS off the response, in the server's spelling. */
export const REVIEWED_SEND_RESPONSE_FIELDS = [
  "message_id",
  "to",
  "cc",
  "interaction_id",
  "record_failure",
  "associations_written",
  "association_failures",
  "sending_event_id",
  "sending_event_gap",
  "compliance",
  "warnings",
  "audit_columns_written",
] as const;

/** One Cc attribution entry as the server's `GmailCcAttribution` spells it. */
function ccAttributionBody(
  entry: ReviewedGmailCcAttribution,
): Record<string, unknown> {
  return {
    address: entry.address,
    contact_point_id: entry.contactPointId,
    medium_id: entry.mediumId,
    held_by_this_record: entry.heldByThisRecord,
  };
}

/**
 * The exact JSON body for one reviewed send.
 *
 * A null/absent optional field is OMITTED rather than sent as null: the server's
 * model defaults every one of them to null, and omitting keeps the body readable
 * in a log next to the fields that are actually saying something.
 */
export function reviewedSendRequestBody(
  request: ReviewedGmailSendRequest,
): Record<string, unknown> {
  const { context } = request;
  const body: Record<string, unknown> = {
    connection_id: request.connectionId,
    to: request.to,
    cc: request.cc,
    subject: request.subject,
    body: request.body,
    user_confirmed: true,
    // Required. The transport refuses the send before this is built when it is
    // missing, so an empty string can never reach the wire.
    organization_id: context.organizationId,
  };
  const optional: Record<string, string | null | undefined> = {
    party_id: context.partyId,
    deal_id: context.dealId,
    project_id: context.projectId,
    contact_point_id: context.contactPointId,
    medium_id: context.mediumId,
    outreach_list_id: context.outreachListId,
    identity_id: context.identityId,
    account_email: context.accountEmail,
    drafted_by_agent_id: context.draftedBy?.agentId,
    drafted_by_run_id: context.draftedBy?.runId,
    drafted_by_label: context.draftedBy?.label,
    approval_assist_id: context.draftedBy?.assistId,
  };
  for (const [key, value] of Object.entries(optional)) {
    if (typeof value === "string" && value.length > 0) body[key] = value;
  }
  if (context.ccAttribution && context.ccAttribution.length > 0) {
    body.cc_attribution = context.ccAttribution.map(ccAttributionBody);
  }
  return body;
}

/**
 * What a surface decides about ONE send, at the moment Send is pressed.
 *
 * 🚨 IT IS DECIDED FROM THE FIELDS ON SCREEN, NOT FROM THE DRAFT. Every field on
 * the review card is editable up to the click, and the record half of this
 * request — which Person the row is filed against, which contact point, whose
 * address each Cc is — is only true of the recipients that are actually about to
 * be sent to. The server records what it is told, so a plan built from a stale
 * draft is a row attesting to a message somebody else received (VERIFY-B1-B2 D1).
 */
export interface ReviewedGmailSendPlan {
  context: ReviewedGmailSendContext;
  /**
   * The address the row is being filed against, so the outcome can be checked
   * against the address the server actually delivered to.
   */
  attributedAddress: string | null;
  /**
   * Set when the client could NOT attribute the recipient to a record: the
   * record fields are left out, so the server files no row, and this sentence —
   * which names the address — is shown after the send. Written to no timeline is
   * a loss a person can repair; a false row on a customer's history is not.
   */
  unattributed: string | null;
}

/** Whether the unsubscribe pair + legal footer were added, and why or why not. */
export interface ReviewedGmailCompliance {
  envelope: boolean;
  footerAppended: boolean;
  /** Always a sentence — the absence of a footer is stated, never silent. */
  reason: string;
}

/**
 * WHAT THE SERVER DID: the message, the row, the edges, the sending event.
 *
 * Everything after `messageId` is the SENT RECORD the server now owns. The
 * browser writes none of it, so these fields are the only account of whether the
 * history is true — `recordFailure` and `sendingEventGap` are sentences with
 * their remedy and are SHOWN, never swallowed.
 */
export interface ReviewedGmailSendOutcome {
  messageId: string;
  /**
   * WHO IT REACHED, as the server's ONE parser read the field — bare addresses,
   * display names stripped. Null from a server older than lane B-10, never an
   * empty string, so a caller can tell "nobody told me" from "nobody was Cc'd".
   */
  to: string | null;
  cc: string[] | null;
  /** The `crm.interaction` row, or null with `recordFailure` saying why. */
  interactionId: string | null;
  recordFailure: string | null;
  /** `type:id` per association edge that landed. */
  associationsWritten: string[];
  /** One sentence per edge that did not. The row is true; a link is missing. */
  associationFailures: string[];
  sendingEventId: string | null;
  /** Why there is no sending event, when there is none. Never silence. */
  sendingEventGap: string | null;
  compliance: ReviewedGmailCompliance | null;
  /** Warnings from the send authority about recipients it did not refuse. */
  warnings: string[];
  /** Which of the six audit columns the row carries. */
  auditColumnsWritten: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function textList(source: Record<string, unknown>, key: string): string[] {
  const value = source[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function narrowCompliance(value: unknown): ReviewedGmailCompliance | null {
  if (!isRecord(value)) return null;
  const reason = text(value, "reason");
  if (reason === null) return null;
  return {
    envelope: value.envelope === true,
    footerAppended: value.footer_appended === true,
    reason,
  };
}

/**
 * Read the server's answer, or refuse it in words.
 *
 * Throws when there is no `message_id`: that is the one field that says the
 * message left, and a caller that shrugged at its absence would report a send
 * nobody can point at. Everything else narrows to a stated absence instead —
 * `null` and empty lists are facts a surface can print.
 */
export function narrowReviewedSendOutcome(
  payload: unknown,
): ReviewedGmailSendOutcome {
  if (!isRecord(payload)) {
    throw new Error(
      "Gmail answered the reviewed send in a shape this app cannot read, so it " +
        "cannot say whether the message went out. Check the record's timeline " +
        "before sending it again.",
    );
  }
  const messageId = text(payload, "message_id");
  if (messageId === null) {
    throw new Error(
      "Gmail did not return a message id for the reviewed send, so it cannot " +
        "be confirmed or recorded. Check the mailbox's Sent folder before " +
        "sending it again.",
    );
  }
  return {
    messageId,
    to: text(payload, "to"),
    cc: Array.isArray(payload.cc) ? textList(payload, "cc") : null,
    interactionId: text(payload, "interaction_id"),
    recordFailure: text(payload, "record_failure"),
    associationsWritten: textList(payload, "associations_written"),
    associationFailures: textList(payload, "association_failures"),
    sendingEventId: text(payload, "sending_event_id"),
    sendingEventGap: text(payload, "sending_event_gap"),
    compliance: narrowCompliance(payload.compliance),
    warnings: textList(payload, "warnings"),
    auditColumnsWritten: textList(payload, "audit_columns_written"),
  };
}

/**
 * The outcome back in the SERVER's own vocabulary, for storing as a receipt.
 *
 * The approval queue keeps what the send answered as the row's receipt, and a
 * receipt written in camelCase would be a second vocabulary for the same facts —
 * unreadable beside `crm.interaction`'s own columns and beside every other
 * receipt the server writes. One spelling, the server's.
 */
export function reviewedSendOutcomeAsRecord(
  outcome: ReviewedGmailSendOutcome,
): Record<string, unknown> {
  return {
    message_id: outcome.messageId,
    to: outcome.to,
    cc: outcome.cc,
    interaction_id: outcome.interactionId,
    record_failure: outcome.recordFailure,
    associations_written: outcome.associationsWritten,
    association_failures: outcome.associationFailures,
    sending_event_id: outcome.sendingEventId,
    sending_event_gap: outcome.sendingEventGap,
    compliance: outcome.compliance
      ? {
          envelope: outcome.compliance.envelope,
          footer_appended: outcome.compliance.footerAppended,
          reason: outcome.compliance.reason,
        }
      : null,
    warnings: outcome.warnings,
    audit_columns_written: outcome.auditColumnsWritten,
  };
}

/**
 * The row the server wrote, read back off a resolved card's data.
 *
 * A host that has to refresh a timeline needs the id and nothing else; it reads
 * it here rather than re-narrowing the whole outcome, and gets null — never a
 * guess — when the send recorded nothing.
 */
export function interactionIdOfSendData(data: unknown): string | null {
  return isRecord(data) ? text(data, "interaction_id") : null;
}

/** One rule that refuses a recipient, in the authority's own words. */
export interface ReviewedGmailRefusalBlock {
  code: string;
  message: string;
  fix: string;
}

/**
 * HTTP 409 `gmail_send_refused` — NOTHING WAS SENT.
 *
 * The gate runs before the provider write, so this is the one refusal a surface
 * may state as "not sent" without qualification. `sent` is carried verbatim
 * rather than assumed: a future server that refuses AFTER a write would say so,
 * and a client that hardcoded `false` would then be lying.
 */
export interface ReviewedGmailRefusal {
  /** The sentence to show, in the same shape the browser's own gate builds. */
  userMessage: string;
  address: string | null;
  /** The human word for the field it came from — "recipient" or "Cc". */
  field: string | null;
  blocks: ReviewedGmailRefusalBlock[];
  remedy: string | null;
  sent: boolean;
}

export const GMAIL_SEND_REFUSED_CODE = "gmail_send_refused";

/**
 * Recognise the 409 on the error the transport threw, or answer null.
 *
 * Reads the canonical `BackendApiError` shape without importing it (this module
 * stays pure): `code`, `userMessage` and `details` are what `parseHttpErrorBody`
 * fills from the server's structured `detail`.
 */
export function reviewedSendRefusalOf(error: unknown): ReviewedGmailRefusal | null {
  if (!isRecord(error)) return null;
  if (error.code !== GMAIL_SEND_REFUSED_CODE) return null;
  const details = isRecord(error.details) ? error.details : {};
  const userMessage =
    text(error as Record<string, unknown>, "userMessage") ??
    text(error as Record<string, unknown>, "message") ??
    "This recipient cannot be contacted right now, so the message was not sent.";
  const blocks = Array.isArray(details.blocks)
    ? details.blocks.filter(isRecord).map((block) => ({
        code: text(block, "code") ?? "unknown_block",
        message: text(block, "message") ?? "This recipient cannot be contacted.",
        fix: text(block, "fix") ?? "Choose a different recipient.",
      }))
    : [];
  return {
    userMessage,
    address: text(details, "address"),
    field: text(details, "field"),
    blocks,
    remedy: text(details, "remedy"),
    // Absent means the server did not say; only an explicit `true` claims a send.
    sent: details.sent === true,
  };
}

/**
 * The fixes worth printing UNDER the refusal sentence.
 *
 * The server's `user_message` already concatenates every block's message and
 * fix, so repeating them verbatim would tell a person the same thing twice. A
 * fix already inside the sentence is therefore dropped, and one that is not —
 * which is what a future server that stops concatenating would send — is shown.
 */
export function reviewedSendRefusalFixes(
  refusal: ReviewedGmailRefusal,
): string[] {
  const sentence = refusal.userMessage.toLocaleLowerCase();
  const seen = new Set<string>();
  const fixes: string[] = [];
  for (const block of refusal.blocks) {
    const fix = block.fix.trim();
    if (!fix || seen.has(fix)) continue;
    seen.add(fix);
    if (sentence.includes(fix.toLocaleLowerCase())) continue;
    fixes.push(fix);
  }
  return fixes;
}

/** How loudly a sentence about the sent record must be said. */
export type ReviewedGmailNoticeLevel = "error" | "warning";

export interface ReviewedGmailNotice {
  level: ReviewedGmailNoticeLevel;
  sentence: string;
}

/**
 * 🚨 EVERY GAP THE SERVER REPORTED, TURNED INTO SOMETHING A PERSON READS.
 *
 * The message has already left by the time any of this is known, and nothing
 * unsends it — so a record that did not land, a sending event that does not
 * exist, or an edge that was refused is stated on the screen the person is
 * looking at. Hiding any of it is how a person comes to believe a timeline is
 * complete when it is not, and the bounce nobody can correlate is the same
 * defect one layer down.
 *
 * Ordered worst-first so a surface that can show only one shows the worst.
 */
export function reviewedSendNotices(
  outcome: ReviewedGmailSendOutcome,
): ReviewedGmailNotice[] {
  const notices: ReviewedGmailNotice[] = [];
  if (outcome.recordFailure) {
    notices.push({ level: "error", sentence: outcome.recordFailure });
  }
  if (outcome.sendingEventGap) {
    notices.push({ level: "warning", sentence: outcome.sendingEventGap });
  }
  for (const failure of outcome.associationFailures) {
    notices.push({ level: "warning", sentence: failure });
  }
  for (const warning of outcome.warnings) {
    notices.push({ level: "warning", sentence: warning });
  }
  return notices;
}

/**
 * Did the server file the row against the address the client attributed?
 *
 * 🚨 THE CLIENT CAN NO LONGER CORRECT THE ROW, so this is the only place a
 * disagreement can be noticed at all. The client decides WHOSE record a send
 * belongs on (`./recipient-integrity.ts`) from the field on the card; the server
 * parses that same field with the same rules (proven case by case against its
 * own corpus in `./mailbox-agreement.test.ts`) and records against the party the
 * client named. If the address it actually delivered to is a different one, the
 * row is on the wrong person's timeline and only a sentence can say so.
 *
 * Compared case-insensitively, as the server's corpus instructs: its parser
 * keeps the case that was typed and this one lowercases for the medium lookup.
 */
export function deliveredAddressDisagreement(
  outcome: ReviewedGmailSendOutcome,
  attributedAddress: string | null,
): string | null {
  if (!attributedAddress || !outcome.to) return null;
  if (outcome.to.trim().toLocaleLowerCase() === attributedAddress.trim().toLocaleLowerCase()) {
    return null;
  }
  return (
    `The message was delivered to ${outcome.to}, but it was recorded against ` +
    `${attributedAddress}. Check the timeline and log it on the right record by ` +
    "hand, and tell an admin the send screen and the server read the recipient " +
    "differently."
  );
}
