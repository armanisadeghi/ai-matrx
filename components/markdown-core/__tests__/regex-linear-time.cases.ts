/**
 * The adversarial inputs of the linear-time guard (round 11). Every regex or
 * scanner on the chat render hot path that was ever super-linear has a case
 * here at ~100 KB; the old code took seconds to hours on each.
 */
export interface RegexLinearTimeCase {
  name: string;
  fn: "math" | "numbering" | "kindScan" | "kindProseLeaf";
  input: string;
  suffix?: string;
  /** Default true: a fresh string per run so no memo answers it. */
  salt?: boolean;
}

const SIZE = 100_000;
const fill = (unit: string) => unit.repeat(Math.ceil(SIZE / unit.length));

export const REGEX_LINEAR_TIME_CASES: RegexLinearTimeCase[] = [
  // F1 — `[ … ]` display-math heuristic (math-normalizer convertBracketDisplayInProse).
  { name: "bracket-open-then-spaces", fn: "math", input: `See [${" ".repeat(SIZE)}`, suffix: "x" },
  { name: "bracket-open-then-space-newlines", fn: "math", input: `See [${fill(" \n")}` },
  { name: "bracket-open-then-blank-indented-lines", fn: "math", input: `Data [\n${fill("    \n")}` },
  { name: "bracket-many-unclosed", fn: "math", input: fill("[a ") },
  { name: "bracket-many-links-never-closing", fn: "math", input: fill("[a](b ") },
  { name: "bracket-closed-after-long-whitespace", fn: "math", input: `[${" ".repeat(SIZE)}x ]` },
  // F1 siblings — escaped `\[ … \]` and `\( … \)`, unclosed.
  { name: "escaped-bracket-many-unclosed", fn: "math", input: fill("\\[ x ") },
  { name: "escaped-paren-many-unclosed", fn: "math", input: fill("\\( x ") },
  { name: "numbering-escaped-bracket-many-unclosed", fn: "numbering", input: fill("\\[ x ") },
  { name: "numbering-dollar-many-unclosed", fn: "numbering", input: `$$${fill(" \\[ x ")}` },
  // F2 — broken kind regions whose balanced close never comes.
  { name: "kind-broken-nested-repeated", fn: "kindScan", input: fill('{"a":[1,{"__kind":"x" 1 [ ') },
  { name: "kind-open-objects-repeated", fn: "kindScan", input: fill('{ "__kind": "x", ') },
  { name: "kind-prose-leaf-broken-nested", fn: "kindProseLeaf", input: fill('{"a":[1,{"__kind":"x" 1 [ ') },
  { name: "kind-prose-leaf-open-objects", fn: "kindProseLeaf", input: fill('{ "__kind": "x", ') },
];
