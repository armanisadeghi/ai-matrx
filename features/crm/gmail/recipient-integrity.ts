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
  /** The address the CARD reported sending to (`receipt.to`), never a draft. */
  sentTo: string;
  source: GmailRecipientSource;
}

export type GmailRecipientIntegrityVerdict =
  | {
      /** The send belongs on the record's timeline. */
      recordOnRecord: true;
      /** The contact point for the address that actually received it. */
      contactPointId: string | null;
      mediumId: string | null;
    }
  | {
      recordOnRecord: false;
      /** What the surface tells the person, verbatim. Never a raw error. */
      refusal: string;
    };

function same(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
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
  const sentTo = input.sentTo.trim();
  const tail =
    "so it was not added to any record's timeline — we cannot tell whose " +
    "address that is. Log it on the right record by hand.";

  if (!sentTo) {
    return {
      recordOnRecord: false,
      refusal: `The message was sent but the review card named no recipient, ${tail}`,
    };
  }

  if (input.source.kind === "proposal") {
    if (same(sentTo, input.source.proposedAddress)) {
      // The address is the one the payload's party holds, so the proposal's own
      // contact point is the association.
      return {
        recordOnRecord: true,
        contactPointId: input.source.contactPointId ?? null,
        mediumId: input.source.mediumId ?? null,
      };
    }
    return {
      recordOnRecord: false,
      refusal: `The message was sent to ${sentTo}, not the address this draft proposed, ${tail}`,
    };
  }

  const held = input.source.heldAddresses.find((option) =>
    same(option.address, sentTo),
  );
  if (held) {
    return {
      recordOnRecord: true,
      contactPointId: held.contactPointId,
      mediumId: held.mediumId,
    };
  }
  return {
    recordOnRecord: false,
    refusal: `The message was sent to ${sentTo}, which this record does not hold, ${tail}`,
  };
}
