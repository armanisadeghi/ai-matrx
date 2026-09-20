/**
 * A PENDING ROW THIS BUILD CANNOT SHOW — described honestly, in ONE place.
 *
 * 🚨 UNTIL 2026-09-17 SUCH A ROW WAS SUBTRACTED FROM ITS SECTION'S TOTAL and
 * warned about in the console. With one of them and nothing else the total was
 * `max(1 - 1, 0) = 0`, so `/approvals` printed "Nothing is waiting on you" over
 * a durable pending proposal — while a person holding a deep LINK to the same
 * row was told the truth (`no_screen`). The console is not a person (round-3
 * hostile verification, common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R3.md` § A-N6).
 *
 * It lives beside the store seam rather than inside it because it touches no
 * store: it is the sentence and the shape, and every reader (`./data.ts`'s page
 * read, each kind's own reader) builds its refused rows through it so the
 * wording cannot drift between sections.
 */

import type { ApprovalItem } from "./types";

export interface UnrenderableProposal {
  /**
   * The row's id, or `null` for a row the assists service's own narrowing
   * refused before the page read could see it (those are counted, not
   * identified; their ids are in that service's warning).
   */
  id: string | null;
  /** The proposal kind the row names, when the action could be read that far. */
  kindId: string | null;
  /** Why the predicate refused it, in a developer's words. */
  why: string;
}

/**
 * THE HONEST ROWS for what a section could not show.
 *
 * Each names the proposal kind (the one fact a developer needs) and what the
 * person can do, and carries NO decision: this build cannot read what the row
 * proposes, so it cannot state what Approve would change — and a control whose
 * effect nobody can state is the dead end this queue exists to end. The queue
 * renders an `unreadable` row without decision controls and outside select-all.
 */
export function unrenderableApprovalItems(
  kindId: string,
  rows: readonly UnrenderableProposal[],
): ApprovalItem[] {
  return rows.map((row, index) => {
    const named = row.kindId
      ? `Its kind is "${row.kindId}"`
      : "Its contents could not be read at all";
    return {
      key: `${kindId}:unshowable:${row.id ?? index}`,
      kindId,
      headline: "A proposal this screen cannot show yet",
      acceptEffect: "Nothing — this screen cannot say what this would change.",
      rejectEffect:
        "Nothing — this screen cannot decide a proposal it cannot read.",
      // Policy rule 1: a reader that cannot resolve the mode refuses rather than
      // guessing one. This row IS that refusal, said out loud.
      mode: "unresolved",
      unreadable: {
        sentence:
          `Something is waiting on you here and this version of the app has no screen for it. ${named}` +
          `${row.id ? `, and its record is ${row.id}` : ""}. Nothing was decided and nothing ` +
          "changed. Tell us and it will be shown here; it stays waiting until then.",
      },
    } satisfies ApprovalItem;
  });
}
