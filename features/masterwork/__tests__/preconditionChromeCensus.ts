/**
 * THE CENSUS BEHIND `unmet-preconditions-are-prompts.test.ts`.
 *
 * A source census — never a change detector (`forcing-function-tests` §7). It
 * derives the CLASS "a not-yet-satisfied precondition dressed as an error"
 * from the source of `features/masterwork/**` and `features/vision-interview/**`
 * and fails on any new member, wherever it is written.
 *
 * It lives beside the test rather than inside it so the same scanner can be
 * pointed at a fixture tree (the self-tests) and at a pre-fix checkout (the
 * failing-then-passing proof) without touching the real files.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface PreconditionViolation {
  /** Path as handed in, relative to the scanned root. */
  file: string;
  /** Which rule caught it — R1 / R2 / R3. */
  rule: "R1-toast-literal" | "R2-toast-validator" | "R3-destructive-banner";
  /** The sentence (or the variable) the user would be shown. */
  sentence: string;
  /** What to do about it. */
  detail: string;
}

/**
 * A sentence is a PROMPT — "you have not filled this in yet" — when it tells
 * the reader what to do BEFORE the action, rather than reporting that
 * something went wrong or is about to be destroyed.
 *
 * Deliberately narrow: it matches the instruction grammar this product uses
 * ("... first", "... before you ...", "needs at least ..."), so a genuine
 * failure sentence ("We couldn't record your sign-off", "This trial proves
 * nothing") is never swept up.
 */
const PRECONDITION_GRAMMAR: ReadonlyArray<RegExp> = [
  /\bfirst[.!]?["'`\s]*$/i,
  /\bfirst\b[^.]*[.—-]/i,
  /\bbefore (you|we|it|this|cleaning|saving|starting|sending|running)\b/i,
  /\bneeds? (at least|a short name|an? )\b/i,
  /\bat least one\b/i,
  // An imperative opening is the plainest prompt grammar there is: the
  // sentence tells the reader to do the thing they have not done.
  /^(Say|Tell us|Pick|Choose|Paste|Attach|Add|Write|Give|Name|Enter|Select|Type|Put|Record|Upload)\b/i,
];

/**
 * Words that mean SOMETHING WENT WRONG. A sentence carrying one of these is
 * reporting a failure and telling the reader how to recover from it — red is
 * the honest colour, whatever its opening verb ("Add the link again.").
 */
const FAILURE_VOCABULARY =
  /\b(could ?n[o']t|cannot|can't|couldn|failed|failure|error|again|no longer|already|logged as|defect|deleted|denied|unavailable|went wrong|lost)\b/i;

export function isPreconditionPrompt(sentence: string): boolean {
  const s = sentence.trim();
  // A bare token ("upload", "add") is an option key, never a sentence.
  if (s.split(/\s+/).length < 3) return false;
  if (FAILURE_VOCABULARY.test(s)) return false;
  return PRECONDITION_GRAMMAR.some((re) => re.test(s));
}

/** Chrome that says "something went WRONG or will be destroyed". */
const DESTRUCTIVE_CHROME =
  /(text-destructive|bg-destructive|border-destructive|variant="destructive"|text-red-|bg-red-|border-red-)/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__") continue;
      walk(full, out);
      continue;
    }
    if (/\.tsx?$/.test(entry) && !/\.(test|spec)\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Functions that ANSWER a precondition question: they return either null or a
 * plain-words sentence saying what is still missing. Their sentences belong on
 * a gated control, never in red chrome.
 */
function preconditionValidators(source: string): Set<string> {
  const names = new Set<string>();
  const re = /(?:export\s+)?function\s+(\w+)\s*\([^)]*\)\s*:\s*string\s*\|\s*null/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const body = source.slice(m.index, source.indexOf("\n}", m.index) + 2);
    for (const literal of stringLiterals(body)) {
      if (isPreconditionPrompt(literal)) {
        names.add(m[1]);
        break;
      }
    }
  }
  return names;
}

/**
 * The source text of every `toast.error(...)` call — argument list included,
 * balanced on parentheses so a ternary or a nested call is not cut in half.
 */
function toastErrorCalls(source: string): string[] {
  const out: string[] = [];
  const marker = "toast.error(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) break;
    let depth = 0;
    let end = at + marker.length - 1;
    for (let i = at + marker.length - 1; i < source.length; i += 1) {
      const c = source[i];
      if (c === "(") depth += 1;
      else if (c === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push(source.slice(at, end + 1));
    from = end + 1;
  }
  return out;
}

/**
 * THE ONE SENTENCE R1 MUST NOT CLAIM: an ORGANIZATION REFUSAL.
 *
 * `toast.error(isOrganizationRequiredError(err) ? "Select an organization …" : …)`
 * reads like prompt grammar and is nothing of the kind. It is reached only from
 * a `catch`, after the person has typed, pressed, and had the act REFUSED —
 * the same shape as the allow-list's "Pick at most ${max}.": an action that did
 * not take effect, which is exactly what red is for. Nothing was created, and
 * saying so is mandatory: `lib/organizations/organizationRefusalToast.ts` is
 * THE one way that refusal reaches a person, and `check-org-refusal-honesty`
 * fails a module that catches this error and shows NOTHING (2026-09-17, after a
 * silent refusal became a silent data loss).
 *
 * Nor can it be gated away. The selected organization is null during boot while
 * `ensureOrgId` deliberately WAITS for it, so a `GatedActionButton` keyed on it
 * would disable the button on a cold start for a person who has an
 * organization — the false refusal that same commit removed, and the
 * dead-looking control Law 4 bans.
 *
 * So the exemption is the consequent of an `isOrganizationRequiredError(...)`
 * test and NOTHING else: every other literal in the same `toast.error(...)`
 * call — including its fallback branch — is still scanned, and a plain
 * `toast.error("Pick a rulebook first.")` in the same file is still a
 * violation.
 */
function organizationRefusalLiterals(call: string): Set<string> {
  const out = new Set<string>();
  const re =
    /isOrganizationRequiredError\s*\([^)]*\)\s*\?\s*(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`]*)`)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(call))) out.add(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/** Every double/single/backtick-quoted literal in a chunk of source. */
function stringLiterals(chunk: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`([^`]*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

/** `setRefusal` → `refusal`; anything else → null. */
function stateNameOfSetter(setter: string): string | null {
  if (!/^set[A-Z]/.test(setter)) return null;
  const rest = setter.slice(3);
  return rest.charAt(0).toLowerCase() + rest.slice(1);
}

/**
 * Every place in `roots` where an unmet precondition is rendered in the chrome
 * this product reserves for failure and destruction.
 */
export function censusPreconditionChrome(
  roots: ReadonlyArray<string>,
  relativeTo: string,
): PreconditionViolation[] {
  const violations: PreconditionViolation[] = [];

  for (const root of roots) {
    for (const file of walk(root)) {
      const source = readFileSync(file, "utf8");
      const rel = path.relative(relativeTo, file);
      const validators = new Set([
        ...preconditionValidators(source),
        ...allImportedValidators(source),
      ]);

      // ── R1: a red toast whose words are an instruction, not a failure ────
      // EVERY literal inside a `toast.error(...)` call, not just the one
      // written first: a refusal hidden in a ternary branch is the same red
      // toast to the person reading it.
      for (const call of toastErrorCalls(source)) {
        const refusals = organizationRefusalLiterals(call);
        for (const sentence of stringLiterals(call)) {
          if (!isPreconditionPrompt(sentence)) continue;
          if (refusals.has(sentence)) continue;
          violations.push({
            file: rel,
            rule: "R1-toast-literal",
            sentence,
            detail:
              "A red toast for something the person has not done YET. Gate the " +
              "control with GatedActionButton and put this sentence in `reason`.",
          });
        }
      }

      // ── R2: a red toast carrying a precondition validator's answer ───────
      // `const refusal = validateX(...)` … `toast.error(refusal)`.
      const fromValidator = new Set<string>();
      for (const name of validators) {
        const assigned = new RegExp(
          `(?:const|let)\\s+(\\w+)\\s*(?::[^=]+)?=\\s*${name}\\s*\\(`,
          "g",
        );
        let a: RegExpExecArray | null;
        while ((a = assigned.exec(source))) fromValidator.add(a[1]);
      }
      for (const variable of fromValidator) {
        if (new RegExp(`toast\\.error\\(\\s*${variable}\\s*[,)]`).test(source)) {
          violations.push({
            file: rel,
            rule: "R2-toast-validator",
            sentence: variable,
            detail:
              `\`${variable}\` holds a precondition validator's sentence and is ` +
              "thrown as a red toast. Put it on the control as a `reason`.",
          });
        }
      }

      // ── R3: a destructive banner rendering a precondition sentence ───────
      // Either the sentence is written in the JSX, or the JSX renders a state
      // variable fed by a precondition validator.
      const stateFromValidator = new Set<string>();
      for (const variable of fromValidator) {
        const setter = new RegExp(`(set[A-Z]\\w*)\\(\\s*${variable}\\s*\\)`, "g");
        let s: RegExpExecArray | null;
        while ((s = setter.exec(source))) {
          const state = stateNameOfSetter(s[1]);
          if (state) stateFromValidator.add(state);
        }
      }
      for (const name of validators) {
        const inlineSetter = new RegExp(`(set[A-Z]\\w*)\\(\\s*${name}\\s*\\(`, "g");
        let s: RegExpExecArray | null;
        while ((s = inlineSetter.exec(source))) {
          const state = stateNameOfSetter(s[1]);
          if (state) stateFromValidator.add(state);
        }
      }

      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (!DESTRUCTIVE_CHROME.test(line)) return;
        const window = lines.slice(index, index + 12).join("\n");
        for (const state of stateFromValidator) {
          if (new RegExp(`\\{\\s*${state}\\s*\\}`).test(window)) {
            violations.push({
              file: rel,
              rule: "R3-destructive-banner",
              sentence: state,
              detail:
                `\`${state}\` holds a precondition validator's sentence and is ` +
                `painted in destructive chrome at line ${index + 1}. A person ` +
                "who has not typed yet is not in an error state.",
            });
          }
        }
        for (const literal of stringLiterals(window.replace(/class[nN]ame=/g, "X="))) {
          if (literal.includes("=") || literal.includes("-")) continue;
          if (!isPreconditionPrompt(literal)) continue;
          violations.push({
            file: rel,
            rule: "R3-destructive-banner",
            sentence: literal,
            detail:
              `An instruction written into destructive chrome at line ${index + 1}.`,
          });
        }
        // Plain JSX text (no quotes) inside the destructive element: only the
        // lines BETWEEN this opening tag and the first thing that ends it, so
        // the scan can never run on into unrelated code below the element.
        const inside: string[] = [];
        for (const l of lines.slice(index + 1, index + 12)) {
          if (/[<>{};()]/.test(l)) break;
          inside.push(l.trim());
        }
        const jsxText = inside.join(" ").trim();
        if (jsxText && isPreconditionPrompt(jsxText)) {
          violations.push({
            file: rel,
            rule: "R3-destructive-banner",
            sentence: jsxText,
            detail: `An instruction written into destructive chrome at line ${
              index + 1
            }.`,
          });
        }
      });
    }
  }

  return violations;
}

/**
 * Validators a file IMPORTS rather than declares (`validateCaseBrief` lives in
 * `probe/service.ts` and is used in `probe/BadExampleProbe.tsx`). Any imported
 * `validateX` / `checkX` name counts — the assignment regexes below only fire
 * when such a name is actually called and stored.
 */
function allImportedValidators(source: string): string[] {
  const names = new Set<string>();
  const re = /\b(validate\w+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) names.add(m[1]);
  return [...names];
}
