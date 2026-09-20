/**
 * THE FAILURE SENTENCE NEVER CLAIMS SOMETHING IT CANNOT KNOW.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R3, N16). `GOOGLE_GENERIC_FAILURE_SENTENCE`
 * asserted "Google did not finish connecting this, and nothing was changed."
 * unconditionally — and it is the sentence every UNMAPPED failure gets,
 * including the one the hub itself raises AFTER the token exchange, the vault
 * write and the scope update: "Google connection … authorized, but NONE of its N
 * discovered resources could be persisted…". The connection very much changed.
 * Combined with N10 the person read "nothing was changed" and "Ready to use" on
 * one screen.
 *
 * THE CLASS FIX PINNED BELOW: the generic sentence states only what is known —
 * it did not finish, part of it may already be recorded, the account's health is
 * the place to look — and the claim is gone. The mapped sentences that DO say
 * "nothing was changed" are the pre-exchange policy refusals, where it is true.
 */

import { BackendApiError } from "@/lib/api/errors";
import {
  GOOGLE_GENERIC_FAILURE_SENTENCE,
  consentFailureAnswer,
} from "../google-adapter";

/** The hub's own post-authorization failure, verbatim. */
const PERSIST_FAILED = new BackendApiError({
  code: "google_resource_persist_failed",
  detail:
    "Google connection 7f3e2b41 authorized, but NONE of its 4 discovered resources could be persisted",
  userMessage: "authorized, but none of its resources could be persisted",
  status: 500,
});

describe("the generic failure sentence", () => {
  it("does not claim that nothing was changed", () => {
    expect(GOOGLE_GENERIC_FAILURE_SENTENCE).not.toMatch(/nothing was changed/i);
    expect(GOOGLE_GENERIC_FAILURE_SENTENCE).not.toMatch(/nothing changed/i);
  });

  it("says what is known: it did not finish, and the health row is the truth", () => {
    expect(GOOGLE_GENERIC_FAILURE_SENTENCE).toMatch(/did not finish/i);
    expect(GOOGLE_GENERIC_FAILURE_SENTENCE.toLowerCase()).toContain("may");
    expect(GOOGLE_GENERIC_FAILURE_SENTENCE).not.toContain("_");
    expect(GOOGLE_GENERIC_FAILURE_SENTENCE).not.toContain("http");
  });

  it("is what a post-authorization failure gets, with the raw text in details", () => {
    const answer = consentFailureAnswer(PERSIST_FAILED);
    expect(answer.sentence).toBe(GOOGLE_GENERIC_FAILURE_SENTENCE);
    expect(answer.details).toContain("none of its resources could be persisted");
  });
});
