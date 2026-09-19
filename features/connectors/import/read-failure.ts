/**
 * features/connectors/import/read-failure.ts
 *
 * 🚨 A READ THAT FAILED IS NOT A READ THAT CAME BACK EMPTY.
 *
 * THE DEFECT THIS CLOSES (F-113, `VERIFY-R10-FIX-WAVE.md` NEW-1/NEW-2,
 * seat-proven 2026-09-18). With the server refusing the contacts read (a live
 * 409 `several_google_accounts`), the import panel printed all of this at once,
 * verbatim from the live DOM:
 *
 *   "2 connected Google accounts can read Contacts: arman@…, titanium-…@….
 *    Re-run with google_account set to the one you mean."
 *   "Still looking for the contact this link named…"
 *   "This Google account has no contacts we can read."
 *
 * Three sentences that cannot all be true. Nothing was still looking; no
 * contact was ever read, so "has no contacts we can read" is a claim nobody
 * verified; and "this Google account" was said while the server had just named
 * TWO. A person meeting that screen concludes their Google account is empty.
 *
 * THE CLASS FIX, the same one F-110 made for the organization gate one surface
 * over: the read has FOUR states, not three, and the fourth has a name.
 *
 *   pending  → the read is in flight; nothing may claim either answer yet.
 *   failed   → the read did not happen. NOTHING derived from rows may render:
 *              not the empty-account sentence, not a still-looking line.
 *   empty    → the read happened and returned nothing. Only here may a screen
 *              say the account has nothing to read.
 *   rows     → the read happened and returned rows.
 *
 * 🚨 AND THE REMEDY IS THE PRESS (the V-24 NEW-3 law, F-110's second half).
 * The remedy the panel showed was the machine instruction "Re-run with
 * `google_account` set to the one you mean" — a sentence naming a thing no
 * control on the screen performs, to a non-technical subject-matter expert, in
 * a panel whose only button re-ran the identical failing request. So the
 * refusal carries its own remedy: when the server says several accounts can
 * answer, the accounts it NAMED become the choice, and pressing one re-runs
 * the read against that account.
 *
 * The candidate accounts come from the SERVER's own sentence — this module
 * never assembles a candidate set of its own from the connections table, which
 * would be a second reading of "which accounts can read this product" that can
 * disagree with the one the server just refused on
 * (`aidream/services/google_integrations/tool_shared.py` →
 * `resolve_google_account`, raising `AmbiguousGoogleAccount`; the router maps
 * it to a 409 `several_google_accounts` in `aidream/api/routers/google_import.py`).
 * `google_account` is matched against a connection's `account_email`, so the
 * usable candidates are exactly the email-shaped names in that sentence — and
 * when it names none this file says so rather than rendering an empty picker.
 */

import { BackendApiError } from "@/lib/api/errors";
import { getUserMessage } from "@/lib/api/errors";

/** The four states of a read. A surface derives, never re-invents, these. */
export type GoogleImportReadState = "pending" | "failed" | "empty" | "rows";

/** The server's code for "several connected accounts could answer this". */
export const SEVERAL_GOOGLE_ACCOUNTS_CODE = "several_google_accounts";

/**
 * The refusal, typed. `several_accounts` is the one failure a person can
 * resolve from this panel; everything else is a sentence plus the press.
 */
export type GoogleImportReadFailure =
  | {
      kind: "several_accounts";
      /** The accounts the SERVER named, in its order. May be empty — see below. */
      accounts: string[];
      /** What a PERSON reads. Never the server's `google_account` instruction. */
      sentence: string;
    }
  | { kind: "failed"; sentence: string };

/** What a person reads when several accounts can answer and we know which. */
export const SEVERAL_ACCOUNTS_SENTENCE =
  "More than one of your Google accounts can be read here, so we did not guess. Choose the account to read from.";

/**
 * …and when the server said several accounts can answer but named none we can
 * send back. Never an empty picker, and never silence: the person is sent to
 * the one screen that lists what they have connected.
 */
export const SEVERAL_ACCOUNTS_UNNAMED_SENTENCE =
  "More than one of your Google accounts can be read here, and we could not tell which ones from the answer. Open Settings → Connectors → Google to see the accounts you have connected, then try again.";

/** Where that sentence sends a person. */
export const GOOGLE_CONNECTIONS_HREF = "/settings/integrations";

/**
 * The email-shaped names in a sentence, de-duplicated, in first-seen order.
 *
 * Deliberately a scan for the SHAPE rather than a positional parse of the
 * server's wording: the account list is the part of that sentence we can
 * recognise without depending on its prose, and a wording change degrades to
 * "named none" (the honest sentence above) instead of to a wrong picker.
 */
export function googleAccountsNamedIn(sentence: string): string[] {
  const found = sentence.match(/[^\s,;:<>()"']+@[^\s,;:<>()"']+\.[^\s,;:<>()"']+/g) ?? [];
  const cleaned = found.map((value) => value.replace(/[.,;:]+$/, ""));
  return [...new Set(cleaned)];
}

/** The refusal a failed read carries, read from the thrown cause. */
export function readGoogleImportFailure(cause: unknown): GoogleImportReadFailure {
  if (cause instanceof BackendApiError && cause.code === SEVERAL_GOOGLE_ACCOUNTS_CODE) {
    // Both fields can carry the account names; the user-facing one first.
    const accounts = [
      ...new Set([
        ...googleAccountsNamedIn(cause.userMessage ?? ""),
        ...googleAccountsNamedIn(cause.detail ?? ""),
      ]),
    ];
    return {
      kind: "several_accounts",
      accounts,
      sentence:
        accounts.length > 0
          ? SEVERAL_ACCOUNTS_SENTENCE
          : SEVERAL_ACCOUNTS_UNNAMED_SENTENCE,
    };
  }
  return { kind: "failed", sentence: getUserMessage(cause) };
}

/**
 * The read's state, from the three things a panel knows. Order matters: a
 * failure outranks rows left over from an earlier read, because those rows are
 * not an answer to the question just asked.
 */
export function googleImportReadState(input: {
  loading: boolean;
  failure: GoogleImportReadFailure | null;
  /** True only when a read has SETTLED — never "we have no rows yet". */
  settled: boolean;
  rowCount: number;
}): GoogleImportReadState {
  if (input.failure) return "failed";
  if (input.loading || !input.settled) return "pending";
  return input.rowCount > 0 ? "rows" : "empty";
}
