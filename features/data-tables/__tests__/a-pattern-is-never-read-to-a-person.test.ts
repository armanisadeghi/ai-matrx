/**
 * A PERSON NEVER READS A REGULAR EXPRESSION (BREAKER-3 B3-04, S2, 2026-09-30).
 *
 * The "+ Row" form printed, under Phone, "Matches ^(?=(?:[^0-9]*[0-9]){7,22}[^0-9]*$)[+]?[0-9 ().-]+…".
 * The store keeps a pattern rule on a phone column; `describeValidationRules` wrote any pattern
 * without a hint as `Matches ${pattern}`, and `validateCellValue` refused with
 * `Must match the pattern ${pattern}` — the row form, the cell refusal, the paste refusal and the
 * column-settings summary all read those two sentences.
 *
 * THE RULE: a pattern is said in words when the column declares words for it — its own example
 * (`patternHint`) or its format's words ("A phone number") — and is otherwise not shown at all. A
 * refusal must still say something, so it says what the column wants in words. An AGENT is the
 * one reader who may see the expression itself: it writes values, and the expression is exact.
 *
 * THE REAL USE CASE: Cedar Ridge Physical Therapy's referral log has a Phone column; the store
 * gave it the phone-shape rule. The receptionist types "call front desk" in it.
 *
 * RED PROOF — run 2026-09-29 against the pre-fix `validation.ts` / `validation-refusal.ts`: clauses
 * 1, 2, 4, 5 and 6 fail (the pattern is on screen); 3 and 7 pass.
 */
import {
  describeValidationRules,
  validateCellValue,
} from "@/features/data-tables/validation";
import { columnRuleRefusal } from "@/features/data-tables/validation-refusal";

const PHONE_PATTERN =
  "^(?=(?:[^0-9]*[0-9]){7,22}[^0-9]*$)[+]?[0-9 ().-]+(?:[ ]*(?:[eE][xX][tT][eE][nN][sS][iI][oO][nN]|[eE][xX][tT]\\.?|[xX])[ ]*[0-9]{1,8})?$";
const JOB_PATTERN = "^JOB-[0-9]{3}$";
const phone = { id: "phone" } as const;

/** Anything that reads like a regular expression: anchors, classes, groups, quantifiers. */
const LOOKS_LIKE_A_PATTERN = /[\^$]|\[[^\]]*\]|\(\?|\{\d+(,\d*)?\}|\\[dwsb.]/;

describe("a pattern rule is said in words or not at all", () => {
  it("1. a phone column's rule reads as 'A phone number' under the field", () => {
    const words = describeValidationRules({ pattern: PHONE_PATTERN }, phone as never);
    expect(words).toEqual(["A phone number"]);
  });

  it("2. a pattern with no words for it is not shown at all", () => {
    const words = describeValidationRules({ pattern: JOB_PATTERN });
    expect(words.join(" ")).not.toMatch(LOOKS_LIKE_A_PATTERN);
    expect(words).toEqual([]);
  });

  it("3. the author's own example is what a person reads", () => {
    const words = describeValidationRules({ pattern: JOB_PATTERN, patternHint: "JOB-123" });
    expect(words.join(" ")).toContain("JOB-123");
    expect(words.join(" ")).not.toMatch(LOOKS_LIKE_A_PATTERN);
  });

  it("4. the refusal on a phone column says what it wants in words", () => {
    const verdict = validateCellValue({
      rules: { pattern: PHONE_PATTERN },
      dataType: "string",
      format: phone as never,
      value: "call front desk",
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toBe("Must be a phone number");
  });

  it("5. the refusal on a column with no words for its pattern never prints it", () => {
    const verdict = validateCellValue({
      rules: { pattern: JOB_PATTERN },
      dataType: "string",
      value: "4471",
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).not.toMatch(LOOKS_LIKE_A_PATTERN);
    expect(verdict.reason.length).toBeGreaterThan(0);
  });

  it("6. the refusal notice's rule list carries the words, never the expression", () => {
    const refusal = columnRuleRefusal({
      fieldDisplayName: "Phone",
      reason: "Must be a phone number",
      rules: { pattern: PHONE_PATTERN },
      format: phone as never,
    } as never);
    expect(refusal.rules.join(" ")).not.toMatch(LOOKS_LIKE_A_PATTERN);
    expect(refusal.rules).toEqual(["A phone number"]);
  });

  it("7. an agent still reads the exact expression — it writes the values", () => {
    const words = describeValidationRules({ pattern: JOB_PATTERN }, null, { audience: "agent" } as never);
    expect(words.join(" ")).toContain(JOB_PATTERN);
  });
});
