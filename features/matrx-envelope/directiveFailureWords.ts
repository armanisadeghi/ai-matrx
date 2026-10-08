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
import {
  directiveFieldLabel,
  type DirectiveFailure,
  type DirectiveFailureWords,
} from "@ai-matrx/content-ir-react";
import {
  CATALOG_ALIASES,
  CATALOG_NOUNS,
} from "@/features/matrx-envelope/catalog-nouns.generated";
import { formTitleColumn } from "@/features/directive-catalog/identityPicker";

const VERB: Record<string, string> = {
  create: "create",
  update: "change",
  delete: "delete",
};

/** The confirm door's line when it had no field detail: no writer for this slug. */
const NO_WRITER = /isn't a valid action as written/i;
/** A confirm-door sentence written for a person. */
const PERSON_READY = /^Nothing was applied — .+$/;

/** The column the write form labels "Title" for this noun — the form's own rule. */
export function directiveTitleColumn(noun: string): string | null {
  const canonical = (CATALOG_ALIASES as Record<string, string>)[noun] ?? noun;
  return formTitleColumn({ noun: canonical, title_column: CATALOG_NOUNS[canonical]?.title_column ?? null });
}

/** One field problem as the server words it: "name is required", "priority: Input should be …". */
const FIELD_PHRASE = /^([A-Za-z_][\w.]*)( is required| is not a field this action has|:)([\s\S]*)$/;

/** "items.0.due_date" → "due_date": the field, never its position in the payload. */
function fieldKeyOf(path: string): string {
  const parts = path.split(".").filter((part) => part && !/^\d+$/.test(part) && part !== "items");
  return parts[parts.length - 1] ?? path;
}

/**
 * THE SERVER'S SENTENCE, IN THE FORM'S WORDS (G10B review, 2026-10-02). The
 * confirm door names the fields it refused by their STORAGE names
 * ("Nothing was applied — name is required.") while the form called that field
 * "Title". Every field the sentence names reads through the one field-label
 * rule the form, the card and the confirm share (`directiveFieldLabel` with the
 * form's title column); everything else in the sentence is left as written.
 */
export function wordServerFieldNames(sentence: string, titleColumn: string | null): string {
  const match = /^(Nothing was applied — )([\s\S]*?)(\.?)$/.exec(sentence.trim());
  if (!match) return sentence;
  const [, head, body, stop] = match;
  // "a; b, and 2 more" — the tail stays with the last phrase.
  const tail = /, and \d+ more$/.exec(body)?.[0] ?? "";
  const phrases = (tail ? body.slice(0, -tail.length) : body).split("; ");
  const worded = phrases.map((phrase) => {
    const field = FIELD_PHRASE.exec(phrase);
    if (!field) return phrase;
    const [, path, verb, rest] = field;
    return `${directiveFieldLabel(fieldKeyOf(path), titleColumn)}${verb}${rest}`;
  });
  return `${head}${worded.join("; ")}${tail}${stop}`;
}

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
    // A remedy that holds however the button got here — an AI wrote it or a
    // person inserted it by hand (G15 review: "Ask for a corrected version"
    // assumed an AI). The card has no edit-values door, so the words stay
    // neutral. Details read the same field names the form shows.
    const titleColumn = directiveTitleColumn(failure.noun);
    const worded = wordServerFieldNames(reason[0], titleColumn);
    return {
      what: worded,
      next: "Correct it, then apply again.",
      details: worded,
    };
  }
  return null;
}
