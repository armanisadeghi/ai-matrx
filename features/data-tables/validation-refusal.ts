/**
 * THE ONE PLACE A COLUMN'S OWN VALIDATION REFUSAL IS TURNED INTO WORDS.
 *
 * 🚨 WHY THIS FILE EXISTS (lane VALIDATION-REFUSAL, 2026-09-23).
 *
 * FIX-15 gave the STORE's refusals one honest surface: `RefusalNotice`, on the
 * cell, portalled out of the table, with the stored value put back. Its own
 * report named what it left behind — the COLUMN's refusal, the one
 * `validateCellValue` makes in the browser before anything is sent, was still a
 * destructive toast that times out while the editor sits open holding the text
 * the person typed. Five surfaces asked that question and five surfaces answered
 * it differently: a timed toast on the grid cell, a bare red `<p>` in each row
 * modal, a toast listing three of them for a paste, and nothing at all on the
 * record form. Four answers to one question is four places for the next one to
 * drift.
 *
 * So: ONE builder here, ONE component (`components/FieldRuleRefusal.tsx`), and
 * every caller of `validateCellValue` that a PERSON can see goes through both.
 *
 * WHY THE REASON IS NOT SIMPLY HANDED TO `RefusalNotice`.
 * `RefusalNotice` renders `plainWords.ts`'s answer and nothing else, and
 * `plainWords` drops any clause carrying MACHINE IDENTITY — a schema-qualified
 * object, a contract row id, a SQLSTATE, a bare snake_case token. That filter is
 * right for the store's prose, which is written by `format()` from the door's own
 * name. It is WRONG for a sentence this app generated from a rule a person wrote:
 * a column whose `patternHint` is `JOB-123` (which is exactly the shape a
 * dispatcher writes) matches the contract-row-id shape `[A-Z]{2,4}-\d{1,3}`, and
 * the one clause naming the rule would be silently excised — the person would be
 * told "That value was not accepted" and never told what the column wants.
 *
 * Therefore the split, and it is the whole design of this file:
 *   · The notice's SENTENCE is our generated prose, checked against the same
 *     filter before it is sent. If it would not survive whole, it is replaced by
 *     an honest general sentence rather than a mutilated one.
 *   · The column's RULES are carried beside the sentence, verbatim, as the
 *     author wrote them, in the notice's `actions` slot — which no filter
 *     touches, because it is content the screen supplies rather than words the
 *     store wrote.
 * Nothing is dropped, and nothing that reaches the eye is machine identity.
 */

import type { RecordsError } from "@ai-matrx/records";
import { hintIsMachineIdentity } from "@ai-matrx/records-ui";

import { describeValidationRules, type ValidationRules } from "./validation";

/**
 * The refusal, ready for the one component. Deliberately NOT a React element:
 * the paste path collects a dozen of these before any of them is drawn, and the
 * row modals hold them in state keyed by field name.
 */
export interface ColumnRuleRefusal {
  /** The column this is about, in the column's own display name. */
  fieldDisplayName: string;
  /** What `validateCellValue` said, kept verbatim for the engineer and the suite. */
  reason: string;
  /**
   * The refusal in the shape every other refusal on this platform arrives in, so
   * `RefusalNotice` draws it identically to a store refusal. `refused_by_rule` is
   * the store's own code for "a Rule refused this value" — the same code
   * `custom.udt_upsert_cell` answers with when the database backstop catches what
   * this caught first, so the person reads ONE sentence shape either way.
   */
  error: RecordsError;
  /**
   * Every rule this column carries, in the author's own words. Rendered literally
   * beside the sentence — see the header: this is the half the machine-identity
   * filter must never be allowed to eat.
   */
  rules: string[];
  /**
   * True when `reason` could not be shown verbatim because it carries a shape the
   * refusal formatter would have excised. The rule text is on screen either way
   * (`rules`); this exists so the suite can prove the substitution happened
   * rather than assuming it.
   */
  reasonWasReshaped: boolean;
}

/**
 * The sentence a person reads when their own words could not be used. It says
 * what happened and no more — inventing a diagnosis would be worse than the
 * identifier it replaced (`plainWords.ts`, rule 4).
 */
const GENERAL_SENTENCE = "That is not a value this column accepts.";

/**
 * What to do now, on a surface that has kept what was typed. The formatter's own
 * table would say "Change the value so it passes, then try again", which is right
 * for a write that is already gone; here the text is still in the editor and the
 * person has two doors, so the remedy names them.
 */
const REMEDY = "Correct it and save again, or discard what you typed.";

/**
 * Build the one refusal. `rules` is the column's whole rule set, not just the one
 * that fired: a person told "At most 20 characters" and nothing else retypes into
 * the next rule. `describeValidationRules` already writes them the way the column
 * editor does, so there is one wording and not two.
 */
export function columnRuleRefusal(args: {
  fieldDisplayName: string;
  reason: string;
  rules?: ValidationRules | null;
}): ColumnRuleRefusal {
  const reason = args.reason.trim();
  // The same judge `RefusalNotice` will apply, asked BEFORE the sentence is
  // handed over, so this file decides what a person reads instead of discovering
  // afterwards that a filter decided for it.
  const reasonWasReshaped = reason === "" || hintIsMachineIdentity(reason);
  const sentence = reasonWasReshaped ? GENERAL_SENTENCE : ensureFullStop(reason);
  return {
    fieldDisplayName: args.fieldDisplayName,
    reason,
    error: {
      code: "refused_by_rule",
      message: sentence,
      // The formatter prefers the door's own hint over its code table, and this
      // IS the door — the column's rule is what refused the value.
      hint: REMEDY,
    } as RecordsError,
    rules: args.rules ? describeValidationRules(args.rules) : [],
    reasonWasReshaped,
  };
}

function ensureFullStop(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}
