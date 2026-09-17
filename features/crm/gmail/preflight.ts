// features/crm/gmail/preflight.ts
//
// 🚨 THE GATE RUNS AGAINST THE RECIPIENTS THAT ARE ABOUT TO BE SENT TO, AND
// AGAINST EVERY ONE OF THEM.
//
// The compose step checks the address in ITS To field. The review card then
// lets every field change — including To and Cc — and posts Send itself. So a
// suppressed, bounced or blocklisted address can be typed in after the check
// passed, and the compose step's verdict would be about somebody else entirely
// (Bugbot MEDIUM #2, 2026-09-17).
//
// The fix is one seam, not two: the card calls `preflight` immediately before
// it posts, with the addresses on its own screen. This module is that preflight
// for every Gmail send from a record — the compose panel AND the approval
// queue's `gmail_send` kind — so there is one answer to "may this message go?".
//
// EVERY ADDRESS IS ASKED ABOUT, HELD OR NOT. An address the open record does
// not hold is not an unknown address: the ORGANIZATION usually already holds a
// `crm.contact_medium` row for it, on another Person, and a legal opt-out lives
// on that row. Skipping it — which is what this file did until 2026-09-17 —
// meant the one send authority was never asked about precisely the addresses
// nobody had vetted (VERIFY-B1-B2 D2). The cost of asking is one extra read per
// stray address.
//
// FAILING CLOSED IS THE POINT, AND THE PARSE IS PART OF IT. A check that
// cannot be read refuses; a verdict that has not answered is not permission; a
// lookup that errors refuses too; a recipient FIELD this cannot parse refuses
// before anything is asked. Only an address this organization holds NO medium
// row for passes without a verdict, and it passes because no suppression can
// exist without that row. Until 2026-09-17 the hole was one layer below this
// law: the lookup swallowed an unnormalisable value and answered "no row", so
// `Ada Lovelace <ada@example.com>` — the form every mail client prints — was
// never asked about and was SENT (VERIFY-B1-B2-R2 N2). Every field now goes
// through the ONE parser (`./mailbox.ts`) FIRST.

import {
  checkSendEligibility,
  findMediumIdsForAddress,
} from "@/features/crm/compliance/service";
import type { EligibilityVerdict } from "@/features/crm/compliance/types";
import { parseRecipientFields, parseToField, type ParsedMailbox } from "./mailbox";
import type { GmailRecipientOption } from "./recipients";

/** Null means "send"; a string is the refusal, in the gate's own words. */
export type GmailPreflightRefusal = string | null;

/** Map a PARSED address to the medium the record holds for it. */
export function mediumIdForAddress(
  address: string,
  options: GmailRecipientOption[],
): string | null {
  const wanted = address.trim().toLocaleLowerCase();
  if (!wanted) return null;
  return (
    options.find(
      (option) => option.address.toLocaleLowerCase() === wanted,
    )?.mediumId ?? null
  );
}

/**
 * Every mailbox this send would reach, parsed and deduplicated — or the field
 * that could not be read.
 *
 * 🚨 THE FIELDS ARE PARSED, NEVER TRIMMED AND HOPED OVER. `To` and every `Cc`
 * entry is an RFC 5322 address LIST: `Ada Lovelace <ada@example.com>` and
 * `a@x.com, b@y.com` are both ordinary, and until 2026-09-17 each arrived here
 * as ONE opaque string that no lookup could match and no gate ever judged
 * (VERIFY-B1-B2-R2 N2, breaks A/B/C). Cc counts: an unsubscribe is an
 * unsubscribe whichever header carries it.
 *
 * 🚨 `To` CARRIES EXACTLY ONE MAILBOX — the server's own rule 1
 * (`aidream …/google_workspace/mailbox.py`). Until 2026-09-17 this parsed `To`
 * the same as any `Cc` field, so `a@x.com, b@y.com` in `To` was accepted here
 * and refused only by the server, one round-trip later, about a field this
 * gate had already waved through (VERIFY-B1-B2-R4 V1). `Cc` still carries as
 * many as a person writes — the remedy IS "put the others in Cc".
 */
export function recipientsOfSend(
  to: string,
  cc: string[],
): { ok: true; mailboxes: ParsedMailbox[] } | { ok: false; raw: string; reason: string } {
  const toParsed = parseToField(to);
  if (!toParsed.ok) return toParsed;
  const ccParsed = parseRecipientFields(cc);
  if (!ccParsed.ok) return ccParsed;
  const seen = new Set(toParsed.mailboxes.map((mailbox) => mailbox.address));
  const mailboxes = [
    ...toParsed.mailboxes,
    ...ccParsed.mailboxes.filter((mailbox) => {
      if (seen.has(mailbox.address)) return false;
      seen.add(mailbox.address);
      return true;
    }),
  ];
  return { ok: true, mailboxes };
}

/** Turn a refusing verdict into the sentence the person sees, fixes included. */
export function refusalSentence(
  address: string,
  verdict: EligibilityVerdict,
): string {
  const reasons = verdict.blocks
    .map((block) => `${block.message} ${block.fix}`.trim())
    .join(" ");
  return `${address} cannot be contacted right now. ${reasons}`.trim();
}

/** What one send's preflight needs to ask about every address on the card. */
export interface GmailPreflightInput {
  to: string;
  cc: string[];
  /** The addresses the open record holds, when a record is open. */
  options: GmailRecipientOption[];
  /**
   * The organization whose contact mediums an unheld address is resolved
   * against. Null means there is none to resolve against.
   */
  organizationId: string | null;
  listId?: string | null;
  identityId?: string | null;
  /** Injected in tests; production asks the one authority. */
  check?: (mediumId: string) => Promise<EligibilityVerdict>;
  /**
   * Injected in tests; production reads `crm.contact_medium`. Returns EVERY
   * medium row the organization holds for the address — one address can hold
   * several (the live unique index includes `platform_slug`) and the
   * suppression may be on any of them (N10).
   */
  lookup?: (address: string) => Promise<string[]>;
}

/**
 * Ask the one authority about every recipient of THIS send.
 *
 * `check` and `lookup` are injected so the decision logic is testable without a
 * database; production passes `checkSendEligibility` and
 * `findMediumIdsForAddress`.
 */
export async function preflightGmailRecipients(
  input: GmailPreflightInput,
): Promise<GmailPreflightRefusal> {
  const {
    to,
    cc,
    options,
    organizationId,
    listId = null,
    identityId = null,
  } = input;
  const check =
    input.check ??
    ((mediumId: string) =>
      checkSendEligibility({ mediumId, listId, identityId }));
  const lookup =
    input.lookup ??
    ((address: string) =>
      organizationId
        ? findMediumIdsForAddress({ organizationId, address })
        : Promise.resolve<string[]>([]));

  const parsed = recipientsOfSend(to, cc);
  if (!parsed.ok) {
    // 🚨 A RECIPIENT FIELD THIS CANNOT READ IS NEVER SENT. Guessing at
    // `Ada ada@example.com` is how the wrong person gets the message, and
    // waving it through is how a suppressed one does.
    return (
      `This message was not sent: ${parsed.reason} ` +
      "Write each recipient as name@example.com, or as " +
      "Name <name@example.com>, and separate them with commas."
    );
  }
  if (parsed.mailboxes.length === 0) {
    return "This message was not sent: it names no recipient.";
  }

  for (const mailbox of parsed.mailboxes) {
    const held = mediumIdForAddress(mailbox.address, options);
    // 🚨 THE RECORD'S OWN MEDIUM IS NOT THE ONLY ONE. The organization is asked
    // about EVERY address, including one this record holds: the same value can
    // carry a second `crm.contact_medium` row (the live unique index includes
    // `platform_slug`) on another Person, and the unsubscribe may be on that
    // one. Checking only the record's row is the same hole as `.limit(1)`, one
    // branch over (R2 N10).
    let mediumIds: string[] = [];
    try {
      mediumIds = await lookup(mailbox.address);
    } catch (error) {
      // 🚨 FAIL CLOSED. A lookup that failed — including a value the
      // canonicalizer refused — is not a lookup that found nothing.
      return (
        `The outbound checks for ${mailbox.address} could not be read. ` +
        (error instanceof Error ? error.message : String(error))
      );
    }
    if (held && !mediumIds.includes(held)) mediumIds = [held, ...mediumIds];
    // No medium row in this organization at all: there is no suppression,
    // complaint or blocklist entry that could exist without one, so there is
    // genuinely nothing to ask. The compose surface has already said out loud
    // that this address is not one the record holds.
    if (mediumIds.length === 0) continue;
    for (const mediumId of mediumIds) {
      let verdict: EligibilityVerdict;
      try {
        verdict = await check(mediumId);
      } catch (error) {
        // 🚨 FAIL CLOSED. A gate that cannot be read is not a gate that said yes.
        return (
          `The outbound checks for ${mailbox.address} could not be read. ` +
          (error instanceof Error ? error.message : String(error))
        );
      }
      if (!verdict.allowed) return refusalSentence(mailbox.address, verdict);
    }
  }
  return null;
}
