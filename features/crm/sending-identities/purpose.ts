// features/crm/sending-identities/purpose.ts
//
// 🚨 A CORRESPONDENCE MAILBOX IS NOT AN OUTREACH MAILBOX, AND THE READ SURFACES
// HAVE TO KNOW IT.
//
// `crm.sending_identity.purpose` (aidream lane B-20, migration 0876) tells the
// two apart. The outbound spine registers a connected Gmail mailbox as
// `purpose='correspondence'` on its FIRST reviewed 1:1 send, purely so the send
// has a `crm.sending_event` to hang an audit trail on — nobody asked for a
// campaign mailbox and nobody is going to publish a TXT record on `gmail.com`.
//
// Every server-side SWEEP excluded those rows by name from the start; the READS
// did not, so the first real reviewed send put a person's personal Gmail on
// `/crm/sending-identities` as a `draft` mailbox whose next step was "prove you
// own this domain", forever, and put the same account in the Connect-mailbox
// dialog's BLOCKED list under "This mailbox is already set up as a sending
// identity" — false, and a dead end our own bookkeeping created, while the
// server's own `create_identity` would have promoted it (VERIFY-B1-B2-R5 W1).
//
// THE SERVER'S HALF (aidream lane B-26) IS WHAT THIS MODULE CONSUMES, and the
// division of labour is deliberate:
//
//   * the LIST is filtered server-side — `GET /sending-identities?purpose=` takes
//     `outreach` (the default), `correspondence` or `all` — so the page asks for
//     the kind it is about and the reveal asks for the other kind BY NAME. Rows
//     are filtered, never hidden.
//   * every row carries `purpose` AND `purpose_note`, the server's own sentence
//     for that purpose. This client RENDERS that sentence; it does not re-word it,
//     so the list, the detail page and any other client say the same thing.
//   * a connectable mailbox carries `recorded_for_audit` + `promotion_note`, a
//     distinct state from `already_used` — which now means only "already a
//     CAMPAIGN mailbox", the one case where setting it up again is meaningless.
//
// What this module adds is the client's half: which read to issue, how the reveal
// is labelled, and THE CONSEQUENCE a person is told before promoting a mailbox,
// because promotion turns on domain proof, warm-up and reading that mailbox's
// incoming mail.
//
// Measured against those server declarations by
// `./purpose-is-the-servers.test.ts`. Pure: no React, no Supabase, no network.

/** The two purposes a sending identity can hold, in the server's spelling. */
export const SENDING_PURPOSE_OUTREACH = "outreach";
export const SENDING_PURPOSE_CORRESPONDENCE = "correspondence";

export type SendingPurpose =
  | typeof SENDING_PURPOSE_OUTREACH
  | typeof SENDING_PURPOSE_CORRESPONDENCE;

/** What a listing may ask for — the server's `IdentityPurposeFilter`. */
export type SendingPurposeFilter = SendingPurpose | "all";

/**
 * 🚨 THE DEFAULT LISTING IS OUTREACH MAILBOXES, and it is the SERVER's default
 * too. Sent explicitly all the same: a page whose meaning depends on a default it
 * never states is one release away from listing audit rows again.
 */
export const DEFAULT_PURPOSE_FILTER: SendingPurposeFilter =
  SENDING_PURPOSE_OUTREACH;

/** Every field this client READS that lane B-26 added, in the server's spelling. */
export const SENDING_IDENTITY_PURPOSE_FIELDS = [
  "purpose",
  "purpose_note",
] as const;

export const CONNECTABLE_PURPOSE_FIELDS = [
  "recorded_for_audit",
  "promotion_note",
] as const;

/** The `purpose` this row declares, or null when the server declared none. */
export function purposeOf(row: { purpose?: string | null }): SendingPurpose | null {
  const value = typeof row.purpose === "string" ? row.purpose.trim() : "";
  if (value === SENDING_PURPOSE_CORRESPONDENCE) return SENDING_PURPOSE_CORRESPONDENCE;
  if (value === SENDING_PURPOSE_OUTREACH) return SENDING_PURPOSE_OUTREACH;
  return null;
}

/** True only when the server SAID this row is a correspondence mailbox. */
export function isCorrespondenceMailbox(row: {
  purpose?: string | null;
}): boolean {
  return purposeOf(row) === SENDING_PURPOSE_CORRESPONDENCE;
}

/**
 * What a correspondence row says about itself — never a status, never a next
 * step, and never "you have not proven you own this domain yet".
 *
 * 🚨 THE SENTENCE IS THE SERVER'S (`purpose_note`), because the server declares
 * one copy so no client re-words it. The address is named here, since the note
 * speaks about "it" and a list row has to say which mailbox. The fallback covers
 * a row from a server that has not shipped the note — it says the same thing
 * rather than leaving the row to be read as a broken outreach mailbox.
 */
export function correspondenceRowSentence(row: {
  from_address: string;
  purpose_note?: string | null;
}): string {
  const note =
    typeof row.purpose_note === "string" && row.purpose_note.trim()
      ? row.purpose_note.trim()
      : "Recorded for audit because reviewed one-to-one messages were sent from " +
        "it. It is not set up to run campaigns, and we do not read it.";
  return `${row.from_address} — ${note}`;
}

/** The badge in place of the setup-status badge, which does not apply here. */
export const CORRESPONDENCE_BADGE_LABEL = "Recorded for audit";

/**
 * 🚨 THE CONSEQUENCE COMES FIRST (the destructive-and-expensive-actions law).
 *
 * "Use for campaigns" promotes the row in place (`create_identity`'s
 * correspondence branch) — every event it already wrote stays on it. What it
 * turns ON is the part a person has to agree to before pressing it, so it is
 * said before the verb, in the order the work arrives.
 */
export const PROMOTE_TO_CAMPAIGNS_TITLE = "Use this mailbox for campaigns?";

export const PROMOTE_TO_CAMPAIGNS_CONSEQUENCE =
  "Three things start applying to it that do not apply today. You will have to " +
  "prove you own its domain by publishing a DNS record, which you cannot do on " +
  "a gmail.com or other provider-owned address. It then warms up for about four " +
  "weeks before a campaign may use it. And campaign replies, bounces and " +
  "complaints are read back out of this mailbox, which means we start reading " +
  "its incoming mail. Its reviewed one-to-one sends stay exactly as they are.";

export const PROMOTE_TO_CAMPAIGNS_CONFIRM_LABEL = "Use for campaigns";

/**
 * The sentence a person reads when the promotion cannot even be attempted: the
 * row has no live Google connection behind it any more, so there is no mailbox
 * to probe. A disabled button that says nothing is the dead end this replaces.
 */
export const PROMOTE_NEEDS_CONNECTION =
  "The Google account this mailbox was recorded through is no longer connected, " +
  "so it cannot be set up for campaigns. Connect that account again and pick it " +
  "in Connect a mailbox.";

/** "1 mailbox recorded for audit" — the reveal names what it holds and how many. */
export function correspondenceRevealLabel(count: number | null): string {
  if (count === null) return "Show mailboxes recorded for audit";
  return count === 1
    ? "Show 1 mailbox recorded for audit"
    : `Show ${count} mailboxes recorded for audit`;
}

export const CORRESPONDENCE_SECTION_TITLE =
  "Recorded for audit — not campaign mailboxes";

export const CORRESPONDENCE_SECTION_EMPTY =
  "No mailbox has been recorded for audit. One appears here the first time a " +
  "reviewed one-to-one message is sent from a connected mailbox.";

// ── The Connect-mailbox dialog ────────────────────────────────────────────────

/**
 * What one connectable mailbox is.
 *
 * 🚨 THREE STATES, NOT TWO. `can_send` alone cannot answer the dialog's question:
 * a mailbox recorded for audit IS connectable (picking it promotes it), and it is
 * not the same offer as an unused mailbox, because promotion turns on domain
 * proof, warm-up and reading that mailbox. `already_used` now means only "already
 * a campaign mailbox", which is the one genuinely meaningless click.
 */
export type ConnectableState =
  | { kind: "connectable" }
  | { kind: "recorded_for_audit"; sentence: string }
  | { kind: "blocked"; sentence: string };

export const CONNECT_CORRESPONDENCE_FALLBACK_SENTENCE =
  "This mailbox is already recorded for audit, because a reviewed message was " +
  "sent from it. Setting it up here makes it a campaign mailbox as well, keeping " +
  "the messages it has already sent.";

export function connectableStateOf(mailbox: {
  can_send: boolean;
  blocked_reason?: string | null;
  already_used?: boolean;
  recorded_for_audit?: boolean;
  promotion_note?: string | null;
}): ConnectableState {
  if (mailbox.recorded_for_audit === true) {
    // The server's own words for what this mailbox is and what picking it does.
    return {
      kind: "recorded_for_audit",
      sentence:
        typeof mailbox.promotion_note === "string" && mailbox.promotion_note.trim()
          ? mailbox.promotion_note.trim()
          : CONNECT_CORRESPONDENCE_FALLBACK_SENTENCE,
    };
  }
  if (mailbox.can_send) return { kind: "connectable" };
  return {
    kind: "blocked",
    // The server's own sentence, unchanged — and never silence when it sent none.
    sentence:
      mailbox.blocked_reason ??
      "This mailbox cannot be used for outreach right now, and the server did " +
        "not say why. Try again in a moment, or tell an admin.",
  };
}
