// features/crm/gmail/preflight.ts
//
// 🚨 THE GATE RUNS AGAINST THE RECIPIENTS THAT ARE ABOUT TO BE SENT TO.
//
// The compose step checks the address in ITS To field. The review card then
// lets every field change — including To and Cc — and posts Send itself. So a
// suppressed, bounced or blocklisted address can be typed in after the check
// passed, and the compose step's verdict would be about somebody else entirely
// (Bugbot MEDIUM #2, 2026-09-17).
//
// The fix is one seam, not two: the card calls `preflight` immediately before
// it posts, with the addresses on its own screen. This module is that preflight
// for CRM sends — it maps each address back to the contact point the record
// holds and asks `crm.check_send_eligibility`, the ONE send authority, about
// every one of them.
//
// FAILING CLOSED IS THE POINT. A check that cannot be read refuses; a verdict
// that has not answered is not permission. An address the record does not hold
// has nothing to look up and is allowed through with the surface having already
// said so in words — that is a known, stated gap, not a silent pass.

import { checkSendEligibility } from "@/features/crm/compliance/service";
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

/**
 * Ask the one authority about every recipient of THIS send.
 *
 * `check` is injected so the pure decision logic is testable without a
 * database; production passes `checkSendEligibility`.
 */
export async function preflightGmailRecipients(
  to: string,
  cc: string[],
  options: GmailRecipientOption[],
  check: (mediumId: string) => Promise<EligibilityVerdict> = (mediumId) =>
    checkSendEligibility({ mediumId }),
): Promise<GmailPreflightRefusal> {
  for (const address of recipientsOfSend(to, cc)) {
    const mediumId = mediumIdForAddress(address, options);
    // Not a contact point we hold: nothing to look up. The compose step has
    // already said out loud that this address is being sent on the person's
    // own judgement.
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
