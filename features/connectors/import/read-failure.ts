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
 * The candidate accounts come from the SERVER — this module never assembles a
 * candidate set of its own from the connections table, which would be a second
 * reading of "which accounts can read this product" that can disagree with the
 * one the server just refused on
 * (`aidream/services/google_integrations/tool_shared.py` →
 * `resolve_google_account`, raising `AmbiguousGoogleAccount`; the router maps
 * it to a 409 `several_google_accounts` in `aidream/api/routers/google_import.py`).
 * Since 2026-09-19 that refusal carries them STRUCTURALLY, as
 * `details.candidate_accounts` — exactly the `google_account` values the call
 * would accept. When it names none this file says so rather than rendering an
 * empty picker.
 */

import { BackendApiError, getUserMessage } from "@/lib/api/errors";

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

/**
 * The accounts the refusal named STRUCTURALLY, from its `details` payload.
 *
 * Narrowed from `unknown` at the boundary (the F-25 pattern): the 409 body is a
 * plain dict on the server, not a declared response model, so nothing about
 * `candidate_accounts` reaches `types/python-generated/api-types.ts` and this
 * file is where its shape is asserted — once, here, never at a call site.
 */
export function googleCandidateAccountsIn(details: unknown): string[] {
  if (typeof details !== "object" || details === null) return [];
  const raw = (details as { candidate_accounts?: unknown }).candidate_accounts;
  if (!Array.isArray(raw)) return [];
  const usable = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(usable)];
}

/** The refusal a failed read carries, read from the thrown cause. */
export function readGoogleImportFailure(cause: unknown): GoogleImportReadFailure {
  if (cause instanceof BackendApiError && cause.code === SEVERAL_GOOGLE_ACCOUNTS_CODE) {
    // The server's own list first. It is the contract; the sentence is prose.
    const structured = googleCandidateAccountsIn(cause.details);
    // FALLBACK, and only for a server older than 2026-09-19, which carried the
    // accounts nowhere but inside the sentence. 🚨 DELETE THIS BRANCH (and the
    // `googleAccountsNamedIn` scan with it, if nothing else calls it) once the
    // server carrying `details.candidate_accounts` is deployed — no-legacy
    // policy, owed line recorded in `features/connectors/FEATURE.md`.
    // Both fields can carry the account names; the user-facing one first.
    const accounts =
      structured.length > 0
        ? structured
        : [
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

/**
 * 🚨 A SELECTION IS ONLY ACTIONABLE OVER ROWS A READ ACTUALLY RETURNED
 * (F-115, `VERIFY-R11-FIX-WAVE.md` NEW-1, 2026-09-19).
 *
 * THE DEFECT: under a FAILED contacts read the panel dropped the rows and kept
 * the selection, so the footer read "1 selected · Review the field map" with
 * the button ENABLED over an empty list — and pressing it fired an import
 * preview for contacts the account had just refused to hand over, under
 * whatever account the failed read was refusing. The Tasks sibling already
 * says the rule out loud ("NO CONTROLS OVER A LIST NOBODY READ") by hiding its
 * footer when it holds no list; this is that rule, once, for both panels.
 *
 * `offered` is the footer itself: in the `failed` state nothing selectable is
 * on screen, so the controls over a selection are ABSENT rather than dead —
 * the same posture the read failure notice above it already takes. `ids` is
 * the part of the selection some read of the CURRENT account has proven to
 * exist (`seenIds` in the contacts panel, the active list's tasks in the Tasks
 * one), so an id no read ever returned can never reach an import call.
 */
export function googleImportSelectionControls(input: {
  state: GoogleImportReadState;
  /** Ids a read of the current account has returned. Never a wish list. */
  provenIds: Iterable<string>;
  selected: readonly string[];
}): { offered: boolean; ids: string[] } {
  const proven = input.provenIds instanceof Set
    ? (input.provenIds as ReadonlySet<string>)
    : new Set(input.provenIds);
  return {
    offered: input.state !== "failed",
    ids: input.selected.filter((id) => proven.has(id)),
  };
}
