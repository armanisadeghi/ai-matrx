/**
 * 🚨 NO SENTENCE A MANDATE SCREEN SAYS TO A PERSON CARRIES AN INTERNAL ID.
 *
 * This is the FRONTEND half of aidream's
 * `services/mandates/tests/test_no_uuid_in_sentences.py`, and it exists because
 * that guard could not see here. FIX-R6 F2 censused NINE organization-naming
 * sentences — eight in Python behind one helper, and a ninth in SQL that "no
 * Python census could see". The same blind spot ran one repo further: this
 * client builds its own refusals, and one of them read
 *
 *     mandate "x": the org rung is version-pinned
 *     (version 8f9326a3-fc3f-438b-b742-b9ed28f363d7), …
 *
 * `features/mandates/service.ts` throws that, `useMandate` puts it in `.error`,
 * and ChatNewClient / EducationTutorClient / ConductorPanel print it on screen
 * verbatim. A uuid at a person is the same defect class as a dead control: the
 * reader cannot act on it. It was pinned by its own test — the shape FIX-R6
 * named — until 2026-09-08.
 *
 * THE RULE. A sentence names a thing the way a person knows it (a display name,
 * a rung, a mandate key — the vocabulary), and when the readable name cannot be
 * had it falls back to a human phrase chosen for THAT sentence. Never an id,
 * never "unknown". An id is a DIAGNOSTIC: it belongs in `console.*`, where the
 * developer who needs it looks, and that is the one exemption below.
 *
 * The census is by BEHAVIOUR, in `mandate-screen-vocabulary.test.ts`'s idiom:
 * it reads the SOURCE of both mandate trees rather than any one delivery path,
 * so a sentence added tomorrow is covered without being listed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

/** Both trees a mandate screen is made of — swept whole. */
const SWEPT_TREES = ["features/mandates", "features/bindings"] as const;

/**
 * An id-shaped interpolation: `${...id}`, `${...Id}`, `${...uuid}`. It matches
 * the EXPRESSION's name, not its value, because a uuid only shows up at runtime
 * and a guard that waited for one would never fire.
 */
const ID_INTERPOLATION =
  /\$\{[^}]*\b[A-Za-z_]*(?:_id|_ids|Id|Ids|uuid|Uuid|UUID)\b[^}]*\}/;

/**
 * Copy, as opposed to code: three words in a row is a sentence, an import path
 * or a css class is not. Same test `mandate-screen-vocabulary.test.ts` uses.
 */
const READS_AS_A_SENTENCE = /[A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}/;

/**
 * Verbatim exemptions. An allow-list you can add to with a wildcard is not an
 * allow-list, so each is the literal source text and each says why.
 *
 * 🚨 Adding a line here is a decision that a PERSON can act on that id. The
 * question to answer first: what would the reader DO with it?
 */
const ALLOWED_SENTENCES: readonly string[] = [
  // `OneBindingWorkspace` — the id is a `.find()` PREDICATE, not printed; the
  // sentence prints `?.name ?? "this organization"`, which is exactly the rule.
  "Deciding for everyone in ${organizations.find((o) => o.id === organizationId)?.name",
];

interface Finding {
  file: string;
  line: number;
  text: string;
}

/** Every `.ts`/`.tsx` under a tree, minus tests and their fixtures. */
function sourceFilesUnder(treeRelative: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "__tests__" || entry === "node_modules") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.test\.tsx?$/.test(entry)) continue;
      out.push(full);
    }
  };
  walk(join(REPO_ROOT, treeRelative));
  return out;
}

/** Comments out, line numbering preserved — a note to the next agent is not copy. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => " ".repeat(line.length));
}

/**
 * THE ONE EXEMPTION: a diagnostic handed to `console.*`. Detected by looking
 * BACKWARDS from the literal to the nearest unclosed call, so an id inside a
 * `console.error(...)` is exempt and the same id in the `throw` on the next
 * line is not.
 */
function isConsoleArgument(source: string, literalStart: number): boolean {
  const before = source.slice(Math.max(0, literalStart - 400), literalStart);
  const call = before.lastIndexOf("console.");
  if (call === -1) return false;
  // Still inside that call only if its parenthesis has NOT closed. Once the
  // depth returns to zero the console call ended, and everything after it — a
  // `throw` on the very next line, which is the real shape in `service.ts` —
  // is outside the exemption.
  const since = before.slice(call);
  let depth = 0;
  for (const ch of since) {
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth <= 0) return false;
    }
  }
  return depth > 0;
}

function templateLiterals(source: string): { text: string; index: number }[] {
  const out: { text: string; index: number }[] = [];
  const pattern = /`(?:[^`\\]|\\.)*`/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    out.push({ text: match[0], index: match.index });
  }
  return out;
}

function sweep(): Finding[] {
  const findings: Finding[] = [];
  for (const tree of SWEPT_TREES) {
    for (const file of sourceFilesUnder(tree)) {
      const source = stripComments(readFileSync(file, "utf8"));
      for (const { text, index } of templateLiterals(source)) {
        if (!ID_INTERPOLATION.test(text)) continue;
        if (!READS_AS_A_SENTENCE.test(text)) continue;
        if (isConsoleArgument(source, index)) continue;
        if (ALLOWED_SENTENCES.some((allowed) => text.includes(allowed))) continue;
        findings.push({
          file: relative(REPO_ROOT, file),
          line: source.slice(0, index).split("\n").length,
          text: text.replace(/\s+/g, " ").slice(0, 220),
        });
      }
    }
  }
  return findings;
}

describe("no mandate sentence prints an internal id at a person", () => {
  it("sweeps both mandate trees and finds none", () => {
    const findings = sweep();
    expect(
      findings.map((f) => `${f.file}:${f.line}  ${f.text}`).join("\n"),
    ).toBe("");
  });

  it("actually reads the source it claims to sweep", () => {
    // A guard that swept nothing would pass forever. Both trees must yield
    // real files, and a sentence this file KNOWS is there must be reachable.
    const files = SWEPT_TREES.flatMap(sourceFilesUnder);
    expect(files.length).toBeGreaterThan(50);
    const service = readFileSync(
      join(REPO_ROOT, "features/mandates/service.ts"),
      "utf8",
    );
    expect(service).toContain("is version-pinned to a ");
  });

  it("the console exemption is falsifiable — it does not exempt a throw", () => {
    const sample = [
      'console.error(`the org rung is pinned to version ${agentId}`);',
      'throw new Error(`the org rung is pinned to version ${agentId}, unpin it`);',
    ].join("\n");
    const literals = templateLiterals(sample).filter(
      (l) => ID_INTERPOLATION.test(l.text) && READS_AS_A_SENTENCE.test(l.text),
    );
    expect(literals).toHaveLength(2);
    expect(isConsoleArgument(sample, literals[0].index)).toBe(true);
    expect(isConsoleArgument(sample, literals[1].index)).toBe(false);
  });
});
