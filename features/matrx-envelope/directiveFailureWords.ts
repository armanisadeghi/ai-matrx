/**
 * THE APP'S PLAIN WORDS FOR A FAILED ACTION CARD — the `explainFailure` seam of
 * `@ai-matrx/content-ir-react` (0.17.0).
 *
 * The package already shows verb-aware defaults with the raw text behind
 * "Details". This names the failures the app recognises, so the sentence says
 * what actually went wrong and what a person can do about it. Matched on the
 * server's own words (aidream `directive_apply/executor.py`); anything not
 * recognised returns null and the package default answers.
 *
 *   - "unknown / non-writable noun 'task'. Writable: [...]" (executor) and the
 *     confirm door's no-detail line "Nothing was applied — this block isn't a
 *     valid action as written." (aidream `output_directives/confirm.py`, what a
 *     "planned" noun answers): the server has no writer for this record yet;
 *   - any other "Nothing was applied — …" line is the server's person-ready
 *     reason (a missing field, a bad value): it IS the sentence, with the
 *     remedy beside it.
 */
import type {
  DirectiveFailure,
  DirectiveFailureWords,
} from "@ai-matrx/content-ir-react";

const VERB: Record<string, string> = {
  create: "create",
  update: "change",
  delete: "delete",
};

/** The confirm door's line when it had no field detail: no writer for this slug. */
const NO_WRITER = /isn't a valid action as written/i;
/** A confirm-door sentence written for a person. */
const PERSON_READY = /^Nothing was applied — .+$/;

export function explainDirectiveFailure(
  failure: DirectiveFailure,
): DirectiveFailureWords | null {
  if (/non-writable noun/i.test(failure.raw) || NO_WRITER.test(failure.raw)) {
    const verb = VERB[failure.directiveClass] ?? "change";
    const noun = failure.nounLabel.trim().toLowerCase() || "item";
    return {
      what: `This button can't ${verb} ${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun} yet.`,
      next: "Do it by hand for now.",
    };
  }
  const reason = PERSON_READY.exec(failure.raw.trim());
  if (reason) {
    return { what: reason[0], next: "Edit the block and apply again." };
  }
  return null;
}
