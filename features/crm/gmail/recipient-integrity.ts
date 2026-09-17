// features/crm/gmail/recipient-integrity.ts
//
// 🚨 THE ONE RECIPIENT-INTEGRITY PRIMITIVE. A CHANGED RECIPIENT IS A DIFFERENT
// PERSON UNTIL SOMETHING PROVES OTHERWISE.
//
// Two surfaces send a Gmail message from a record — `GmailComposePanel` and the
// approval queue's `gmail_send` kind — and BOTH call the same writer
// (`./service.ts`). Every field on the review card is editable up to the click,
// so in both paths the address that actually received the message can be one
// nothing here can attribute to a Person. Until 2026-09-17 only the approvals
// kind carried the guard, in its own private copy: the compose panel recorded a
// message sent to a stranger on the open record's timeline and told the user
// "Sent, and recorded on Ada's timeline" — the exact lie the sibling path was
// fixed to refuse (VERIFY-B1-B2 D1). One primitive, consumed by both, is why
// that cannot diverge again.
//
// THE RULE: a row goes on a Person's timeline only when the address the card
// reported is an address that record (or that draft) authorized. Otherwise the
// message is recorded on NO Person and the surface SAYS SO, with the address, so
// a human can log it on the right record. Written to no timeline is a loss a
// person can see and repair; a false row on a customer's history is not.
//
// Pure — no React, no Supabase — so both consumers, and the tests, read the same
// answer.

import { parseMailboxField } from "./mailbox";
import type { GmailRecipientOption } from "./recipients";

/** Where the send came from, which decides what "authorized" means. */
export type GmailRecipientSource =
  /**
   * A person composing on a record: the addresses the RECORD holds are the
   * authorized set, because that is what makes the row true.
   */
  | { kind: "record"; heldAddresses: GmailRecipientOption[] }
  /**
   * An agent proposal approved in the queue: the proposal's own address is the
   * authorized one — it is the address whose party the payload names.
   */
  | {
      kind: "proposal";
      proposedAddress: string;
      /** The contact point the proposal named for that address, when it named one. */
      contactPointId?: string | null;
      mediumId?: string | null;
    };

export interface GmailRecipientIntegrityInput {
  /**
   * The To field the CARD reported sending to (`receipt.to`), never a draft. It
   * is a FIELD, not an address: `Ada Lovelace <ada@example.com>` and
   * `a@x.com, b@y.com` both arrive here and are parsed, not compared as text
   * (VERIFY-B1-B2-R2 break A — the record's OWN address in display form was
   * refused, so the message left and was recorded on nobody).
   */
  sentTo: string;
  /** The Cc the card reported. Checked for eligibility elsewhere; ATTRIBUTED here. */
  sentCc?: string[];
  source: GmailRecipientSource;
}

/**
 * One address that received a copy, and whether this record can account for it.
 *
 * 🚨 A Cc IS A RECIPIENT. The row lands on the To's Person and prints the Cc on
 * her timeline; until this existed nothing said whether the Cc belonged to this
 * record or to a stranger, so a second customer's address appeared on the first
 * customer's history with no attribution at all (N9, break D). A Cc that this
 * record does not hold is still SHOWN — marked as unattributed, never hidden and
 * never implied to belong here.
 */
export interface GmailCcAttribution {
  address: string;
  contactPointId: string | null;
  mediumId: string | null;
  heldByThisRecord: boolean;
}

export type GmailRecipientIntegrityVerdict =
  | {
      /** The send belongs on the record's timeline. */
      recordOnRecord: true;
      /** The contact point for the address that actually received it. */
      contactPointId: string | null;
      mediumId: string | null;
      /**
       * THE ADDRESS THE ROW IS FILED AGAINST, bare and lowercased.
       *
       * 🚨 The caller needs it because the browser no longer writes the row: the
       * server does, from the party this verdict authorized, and the only way to
       * notice that it delivered to a DIFFERENT address than the one attributed
       * is to compare the two afterwards (`./reviewed-send-contract.ts`
       * → `deliveredAddressDisagreement`).
       */
      attributedAddress: string;
      /**
       * Every OTHER address that received a copy — the Cc, plus any further To
       * address beyond the one this row is attributed to — each marked with
       * whether this record holds it.
       */
      cc: GmailCcAttribution[];
    }
  | {
      recordOnRecord: false;
      /** What the surface tells the person, verbatim. Never a raw error. */
      refusal: string;
    };

/** The addresses one field names, parsed; an unreadable field names none. */
function addressesOf(field: string): string[] {
  const parsed = parseMailboxField(field);
  return parsed.ok ? parsed.mailboxes.map((mailbox) => mailbox.address) : [];
}

function holderOf(
  address: string,
  held: GmailRecipientOption[],
): GmailRecipientOption | null {
  return (
    held.find(
      (option) => option.address.trim().toLocaleLowerCase() === address,
    ) ?? null
  );
}

/**
 * Attribute every copied-to address against the record's own addresses.
 * `exclude` is the address the row itself is attributed to, so it is not also
 * listed as a copy.
 */
function attributeCopies(
  addresses: string[],
  held: GmailRecipientOption[],
  exclude: string | null,
): GmailCcAttribution[] {
  const seen = new Set<string>(exclude ? [exclude] : []);
  const out: GmailCcAttribution[] = [];
  for (const address of addresses) {
    if (seen.has(address)) continue;
    seen.add(address);
    const holder = holderOf(address, held);
    out.push({
      address,
      contactPointId: holder?.contactPointId ?? null,
      mediumId: holder?.mediumId ?? null,
      heldByThisRecord: Boolean(holder),
    });
  }
  return out;
}

/**
 * Decide whether a sent message may be recorded on the record it was composed
 * from, and with which contact point.
 *
 * The refusal sentence is part of the primitive on purpose: two surfaces
 * wording the same refusal two ways is how one of them ends up softer than the
 * truth.
 */
export function assessGmailRecipientIntegrity(
  input: GmailRecipientIntegrityInput,
): GmailRecipientIntegrityVerdict {
  const rawTo = input.sentTo.trim();
  const tail =
    "so it was not added to any record's timeline — we cannot tell whose " +
    "address that is. Log it on the right record by hand.";

  if (!rawTo) {
    return {
      recordOnRecord: false,
      refusal: `The message was sent but the review card named no recipient, ${tail}`,
    };
  }

  const toAddresses = addressesOf(rawTo);
  if (toAddresses.length === 0) {
    // The field could not be read at all — the send authority refuses such a
    // field before anything leaves, so reaching here means the card posted
    // something this cannot attribute. Never guessed at.
    return {
      recordOnRecord: false,
      refusal: `The message was sent to ${rawTo}, which could not be read as an email address, ${tail}`,
    };
  }
  const ccAddresses = (input.sentCc ?? []).flatMap((field) =>
    addressesOf(field),
  );

  if (input.source.kind === "proposal") {
    const proposed = addressesOf(input.source.proposedAddress);
    const match = toAddresses.find((address) => proposed.includes(address));
    if (match) {
      // The address is the one the payload's party holds, so the proposal's own
      // contact point is the association.
      const held: GmailRecipientOption[] = input.source.mediumId
        ? [
            {
              address: match,
              contactPointId: input.source.contactPointId ?? "",
              mediumId: input.source.mediumId,
              label: null,
              isPrimary: true,
              warning: null,
            },
          ]
        : [];
      return {
        recordOnRecord: true,
        contactPointId: input.source.contactPointId ?? null,
        mediumId: input.source.mediumId ?? null,
        attributedAddress: match,
        cc: attributeCopies([...toAddresses, ...ccAddresses], held, match),
      };
    }
    return {
      recordOnRecord: false,
      refusal: `The message was sent to ${rawTo}, not the address this draft proposed, ${tail}`,
    };
  }

  const heldAddresses = input.source.heldAddresses;
  const attributed = toAddresses.find((address) =>
    Boolean(holderOf(address, heldAddresses)),
  );
  if (attributed) {
    const holder = holderOf(attributed, heldAddresses);
    return {
      recordOnRecord: true,
      contactPointId: holder?.contactPointId ?? null,
      mediumId: holder?.mediumId ?? null,
      attributedAddress: attributed,
      cc: attributeCopies(
        [...toAddresses, ...ccAddresses],
        heldAddresses,
        attributed,
      ),
    };
  }
  return {
    recordOnRecord: false,
    refusal: `The message was sent to ${rawTo}, which this record does not hold, ${tail}`,
  };
}
