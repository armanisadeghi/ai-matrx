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
// FAILING CLOSED IS THE POINT. A check that cannot be read refuses; a verdict
// that has not answered is not permission; a lookup that errors refuses too.
// Only an address this organization holds NO medium row for passes without a
// verdict, and it passes because no suppression can exist without that row.

import {
  checkSendEligibility,
  findMediumIdForAddress,
} from "@/features/crm/compliance/service";
import type { EligibilityVerdict } from "@/features/crm/compliance/types";
import type { GmailRecipientOption } from "./recipients";

/** Null means "send"; a string is the refusal, in the gate's own words. */
export type GmailPreflightRefusal = string | null;

/** Map an address to the medium the record holds for it, case-insensitively. */
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
 * Every address this send would reach, deduplicated, in the order they appear.
 * Cc counts: an unsubscribe is an unsubscribe whichever header carries it.
 */
export function recipientsOfSend(to: string, cc: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [to, ...cc]) {
    const address = raw.trim();
    if (!address) continue;
    const key = address.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
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
   * against. Null means there is none to resolve against (and the refusal says
   * so is not needed: nothing can be looked up, so nothing is claimed).
   */
  organizationId: string | null;
  listId?: string | null;
  identityId?: string | null;
  /** Injected in tests; production asks the one authority. */
  check?: (mediumId: string) => Promise<EligibilityVerdict>;
  /** Injected in tests; production reads `crm.contact_medium`. */
  lookup?: (address: string) => Promise<string | null>;
}

/**
 * Ask the one authority about every recipient of THIS send.
 *
 * `check` and `lookup` are injected so the decision logic is testable without a
 * database; production passes `checkSendEligibility` and
 * `findMediumIdForAddress`.
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
        ? findMediumIdForAddress({ organizationId, address })
        : Promise.resolve(null));

  for (const address of recipientsOfSend(to, cc)) {
    let mediumId = mediumIdForAddress(address, options);
    if (!mediumId) {
      // Not on this record — ask the organization, because the opt-out lives on
      // the org's medium row whichever Person happens to hold it.
      try {
        mediumId = await lookup(address);
      } catch (error) {
        // 🚨 FAIL CLOSED. A lookup that failed is not a lookup that found
        // nothing.
        return (
          `The outbound checks for ${address} could not be read. ` +
          (error instanceof Error ? error.message : String(error))
        );
      }
    }
    // No medium row in this organization at all: there is no suppression,
    // complaint or blocklist entry that could exist without one, so there is
    // genuinely nothing to ask. The compose surface has already said out loud
    // that this address is not one the record holds.
    if (!mediumId) continue;
    let verdict: EligibilityVerdict;
    try {
      verdict = await check(mediumId);
    } catch (error) {
      // 🚨 FAIL CLOSED. A gate that cannot be read is not a gate that said yes.
      return (
        `The outbound checks for ${address} could not be read. ` +
        (error instanceof Error ? error.message : String(error))
      );
    }
    if (!verdict.allowed) return refusalSentence(address, verdict);
  }
  return null;
}
