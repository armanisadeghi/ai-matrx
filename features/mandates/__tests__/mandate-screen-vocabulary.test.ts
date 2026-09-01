/**
 * THE OLD SYSTEM'S NOUNS, SWEPT OUT OF THE COPY A MANDATE SCREEN RENDERS.
 *
 * 🚨 WHY THIS FILE EXISTS AND `options-drawer-words.test.ts` WAS NOT ENOUGH
 * (V2 round 4). That guard walks WORDS OBJECTS — `SHORTCUT_*_WORDS` versus
 * `JOB_*_WORDS` — which is exactly the right shape for copy that arrives
 * through a wording prop. It is blind to a sentence hardcoded inside a
 * component, and that is where the noun kept coming back:
 *
 *   round 3 → `AdvancedSection`'s nested overrides words (a NEW words object)
 *   round 4 → `MandateContextGate.tsx:102`, a plain JSX string that no words
 *             object has ever passed through:
 *             "Scope values and Surface values reach it under its own context
 *             policies."
 *
 * Three rounds, three different delivery paths, one noun. So the census is now
 * by BEHAVIOUR — every string a mandate screen can render — rather than by the
 * one delivery path the last recurrence happened to use. It reads the SOURCE of
 * every component the mandate hosts mount, strips comments (an agent's note to
 * the next agent is not copy), and flags any human sentence naming the old
 * system.
 *
 * Comments are stripped rather than swept, deliberately: the files under review
 * are dense with prose ABOUT the surface system, and a guard that fails on an
 * explanation nobody sees would be turned off within a week.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  consumptionMapProblems,
  describeSource,
  parseConsumptionMapWithDrops,
  type ConsumptionMap,
  type OfferedValue,
} from "@/features/mandates/provision-shapes";

const REPO_ROOT = join(__dirname, "..", "..", "..");

/**
 * WHAT A MANDATE SCREEN IS MADE OF. The three hosts
 * (`/mandates/[mandateKey]`, `/organizations/…/settings/mandates/[key]`,
 * `/administration/mandates/[mandateKey]`) render the mandate feature and the
 * one-binding workspace; those two trees are swept whole, so a component added
 * to either tomorrow is covered without being listed.
 */
const SWEPT_TREES = ["features/mandates", "features/bindings"] as const;

/**
 * Shared modules OUTSIDE those trees whose prose reaches a mandate screen.
 * Listed one by one, with the surface that renders each — a whole-tree sweep of
 * `features/surfaces` would be wrong (that IS the surface system, where the
 * noun is correct).
 */
const SWEPT_FILES = [
  // `describeSuggestion` — the AI map's own prose, printed beside every
  // proposal in the one-binding workspace. The third source V2 named.
  "features/surfaces/utils/binding-suggestions.ts",
] as const;

/**
 * The old system's vocabulary, as a person reads it — the same expression the
 * words-object guard uses, kept in step with it by the assertion at the bottom
 * of this file. "Keyboard shortcut" is a real control and not this defect.
 */
const OLD_SYSTEM_NOUNS = /\bshortcuts?\b|\bsurfaces?\b/i;
const ALLOWED_PHRASES = /keyboard shortcuts?/gi;

/**
 * Sentences where the SUBJECT genuinely is the surface system, so its name is
 * the honest word. Each one is listed verbatim: an allow-list you can add to
 * with a wildcard is not an allow-list.
 *
 * 🚨 Adding a line here is a decision about product vocabulary, not a way past
 * a red test. The question to answer first is the one Arman asks: would the
 * person reading this screen know what that noun means?
 */
const ALLOWED_SENTENCES: readonly string[] = [
  // The refusal when the server could not compile the served input surface —
  // "input surface" is the served contract's own name, printed for a super
  // admin pointing the app at a server, and the remedy names a server.
  "The server answered without a compiled input surface, so there is nothing honest to map onto.",
  // A stored map whose source is genuinely a surface value: naming what the
  // stored row says is the point of the sentence.
  "Mandate consumption entry for",
  // The RAW TABLE BROWSER (`admin/advanced`) describing the retired system's
  // own tables — `mandate.vw_shortcut` and `mandate.shortcut_key_map` are their
  // real names, and a blurb that refused to say them would describe nothing.
  "The shortcut compat view in the exact old agent.shortcut shape.",
  "The old-shortcut-id → mandate identity map produced by the 6.6 migration.",
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

/**
 * Comments out, line numbering preserved. Newlines inside a block comment are
 * kept so a finding still reports the line a person could go read.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (line) => " ".repeat(line.length));
}

/**
 * Copy, as opposed to code. A human sentence has spaces and letters; an import
 * path, a css class list, a data key and a mapType do not read like English.
 * Erring toward FLAGGING is deliberate — a false positive costs one line in the
 * allow-list above and a real one costs a verifier round.
 */
function looksLikeCopy(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  if (!/\s/.test(trimmed)) return false;
  if (!/[a-z]{3}/i.test(trimmed)) return false;
  // Paths, urls, imports.
  if (/^[@./]/.test(trimmed) || trimmed.includes("://")) return false;
  // Tailwind / class strings: many tokens, none of them a word with a vowel
  // pattern a sentence would have.
  if (/^[a-z0-9:_\-/[\]().% ]+$/.test(trimmed) && !/[.!?,;]/.test(trimmed)) {
    const words = trimmed.split(/\s+/);
    const codey = words.filter((w) => /[-:_/[\]]/.test(w)).length;
    if (codey >= words.length / 2) return false;
  }
  return true;
}

function isAllowed(text: string): boolean {
  return ALLOWED_SENTENCES.some((allowed) => text.includes(allowed));
}

/** Quoted literals plus JSX text, each with the line it sits on. */
function copyStringsOf(source: string): { line: number; text: string }[] {
  const stripped = stripComments(source);
  const found: { line: number; text: string }[] = [];
  const lineOf = (index: number) =>
    stripped.slice(0, index).split("\n").length;

  const LITERAL = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  for (const match of stripped.matchAll(LITERAL)) {
    const text = match[1] ?? match[2] ?? match[3] ?? "";
    if (text) found.push({ line: lineOf(match.index ?? 0), text });
  }

  // JSX text nodes: everything between a `>` and the next `<` that is not code.
  const JSX_TEXT = />([^<>{}]{12,})</g;
  for (const match of stripped.matchAll(JSX_TEXT)) {
    const text = match[1].replace(/\s+/g, " ").trim();
    if (text) found.push({ line: lineOf(match.index ?? 0), text });
  }
  return found;
}

function sweep(): Finding[] {
  const files = [
    ...SWEPT_TREES.flatMap(sourceFilesUnder),
    ...SWEPT_FILES.map((f) => join(REPO_ROOT, f)),
  ];
  const findings: Finding[] = [];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    for (const { line, text } of copyStringsOf(source)) {
      if (!looksLikeCopy(text)) continue;
      if (isAllowed(text)) continue;
      if (!OLD_SYSTEM_NOUNS.test(text.replace(ALLOWED_PHRASES, ""))) continue;
      findings.push({ file: relative(REPO_ROOT, file), line, text });
    }
  }
  return findings;
}

/**
 * ── THE SWEEP RUNS BOTH WAYS (V1 round 4, O3) ────────────────────────────────
 *
 * The mandate screens must not say "surface"/"shortcut" — and the AGENT doors
 * must not say "holder". O3 was the second direction: the shortcut editor's
 * model picker read *"Use the holder's own model"* between two of its own
 * sentences saying *"the agent's own model"*. One screen, two nouns for one
 * thing, and the reader is a person who has never heard either word.
 *
 * A one-directional guard would have shipped that, so the same machinery is
 * pointed at the agent doors with the foreign noun swapped. The shared
 * run-controls are included because that is where the offending string lived:
 * a component mounted by BOTH doors must take its noun from its host.
 */
const AGENT_DOOR_TREES = [
  "features/agent-shortcuts",
  "features/agents/components/run-controls",
] as const;

/** "Holder" is the mandate system's word. On an agent door it is foreign. */
const JOB_ONLY_NOUNS = /\bholders?\b/i;

/**
 * Copy on an agent door that legitimately names a holder: places whose subject
 * genuinely IS a mandate binding. Listed verbatim, same rule as above.
 */
const AGENT_DOOR_ALLOWED: readonly string[] = [];

describe("no agent door speaks the mandate system's noun", () => {
  it("sweeps the shortcut editor and the shared run controls", () => {
    const offenders: string[] = [];
    for (const tree of AGENT_DOOR_TREES) {
      for (const file of sourceFilesUnder(tree)) {
        const source = readFileSync(file, "utf8");
        for (const { line, text } of copyStringsOf(source)) {
          if (!looksLikeCopy(text)) continue;
          if (AGENT_DOOR_ALLOWED.some((a) => text.includes(a))) continue;
          if (!JOB_ONLY_NOUNS.test(text)) continue;
          offenders.push(`${relative(REPO_ROOT, file)}:${line} — "${text}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("would still catch the exact O3 string", () => {
    // RED-THEN-GREEN, kept executable: the label as it shipped.
    const shipped = "Use the holder's own model";
    expect(looksLikeCopy(shipped)).toBe(true);
    expect(JOB_ONLY_NOUNS.test(shipped)).toBe(true);
  });
});

describe("no mandate screen speaks the old system's nouns", () => {
  it("sweeps the rendered copy of every mandate-screen component", () => {
    const offenders = sweep().map(
      (f) => `${f.file}:${f.line} — "${f.text}"`,
    );
    expect(offenders).toEqual([]);
  });

  it("actually reads files — a sweep that finds nothing because it looked nowhere is not a guard", () => {
    const swept = SWEPT_TREES.flatMap(sourceFilesUnder);
    expect(swept.length).toBeGreaterThan(30);
    expect(
      swept.some((f) => f.endsWith("MandateContextGate.tsx")),
    ).toBe(true);
    expect(
      swept.some((f) => f.endsWith("OneBindingWorkspace.tsx")),
    ).toBe(true);
  });

  it("would still catch the exact V2 round-4 sentence", () => {
    // RED-THEN-GREEN, kept executable: the line as it shipped, run through the
    // same predicates the sweep uses. If someone loosens `looksLikeCopy` or the
    // noun expression, this fails before the recurrence does.
    const shipped =
      "On — the Holder decides. Scope values and Surface values reach it under its own context policies.";
    expect(looksLikeCopy(shipped)).toBe(true);
    expect(isAllowed(shipped)).toBe(false);
    expect(OLD_SYSTEM_NOUNS.test(shipped)).toBe(true);
  });

  it("and the two earlier recurrences, in the shapes they arrived in", () => {
    const roundThree = "when it is launched from a menu or a surface";
    const roundOne = "Override LLM parameters for this shortcut.";
    for (const copy of [roundThree, roundOne]) {
      expect(looksLikeCopy(copy)).toBe(true);
      expect(OLD_SYSTEM_NOUNS.test(copy)).toBe(true);
    }
  });

  it("does not fire on comments, imports, class names or mapTypes", () => {
    const notCopy = [
      "@/features/surfaces/types",
      "surface_value",
      "flex items-center gap-2 rounded-md border-surface",
      "data-surface-value",
    ];
    for (const text of notCopy) {
      expect(looksLikeCopy(text) && OLD_SYSTEM_NOUNS.test(text)).toBe(false);
    }
    // A comment ABOUT the surface system is stripped before the sweep sees it.
    const withComment = `// this mirrors the surface bind panel\nconst a = 1;`;
    expect(
      copyStringsOf(withComment).some((s) => OLD_SYSTEM_NOUNS.test(s.text)),
    ).toBe(false);
  });
});

/**
 * ── THE SIBLING CLASS: THE MACHINE'S KEYS INSIDE A PERSON'S SENTENCE ─────────
 * (V2 round 5, R5-1.)
 *
 * The noun guard above closed "surface"/"shortcut". It could never have caught
 * what round 5 found, because the offending words are not IN the source at all
 * — they are INTERPOLATED at render time:
 *
 *   `"task_overview" asks the person for this input but has no question`
 *
 * Ten sentences, one function (`consumptionMapProblems`), rendered by BOTH
 * modes on BOTH hosts as the one-binding UI's whole pre-flight refusal voice —
 * in prose type, one line under the very label the screen already renders
 * correctly ("Task Overview"). Two of them also spoke a raw kind token.
 *
 * So this half of the guard is by BEHAVIOUR, not by source text: it DRIVES the
 * refusal voice with the snake_case keys a real provision uses and demands that
 * nothing it says back contains one. A sentence assembled from three template
 * holes is only readable by running it, and that is what this does.
 *
 * 🔶 WHY NOT A SOURCE SCAN, said plainly. The same `looksLikeCopy` predicate
 * pointed at source literals across the two trees was measured before this was
 * written: **103 hits**, and essentially none of them a defect — `console.error`
 * strings (`[provisions] consumption_map entry …`), `select("id, agent_id,
 * version_number")` column lists, the raw table browser's SQL, and the admin
 * console's agent-facing prompts, which name DB columns because that is their
 * subject. A guard whose allow-list is a hundred lines long is a guard nobody
 * keeps. The rendered sentence is where the defect lives, so the rendered
 * sentence is what is swept — and this half runs the real writers, so it cannot
 * pass because it looked in the wrong place.
 */

/** An identifier in the machine's register: `task_overview`, `file_list`. */
const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

/** The keys a real provision and a real agent use — snake_case, every one. */
const OFFERED: OfferedValue[] = [
  {
    name: "task_overview",
    kind: "text",
    guaranteed: true,
    lazy: false,
    description: "What the job is for.",
  },
  {
    name: "prior_clean_text",
    kind: "text",
    guaranteed: false,
    lazy: false,
    description: "Optional earlier draft.",
  },
  {
    name: "rulebook_document",
    kind: "rulebook_document",
    guaranteed: true,
    lazy: false,
    description: "A structured rulebook.",
  },
  {
    name: "source_files",
    kind: "file_list",
    guaranteed: true,
    lazy: false,
    description: "Files that came with the call.",
  },
];

const HOLDER_TARGETS = [
  { name: "task_overview", label: undefined },
  { name: "system_prompt", label: undefined },
  { name: "run_notes", label: "Run Notes" },
];

/**
 * Every branch of the pre-flight, driven at once — one map that trips each of
 * the ten sentences. `as never` nowhere: these are the real stored shapes.
 */
function everyRefusal(): string[] {
  const map: ConsumptionMap = {
    // structured literal, joined with another source → two sentences
    task_overview: [
      { mapType: "direct_value", target: { a: 1 }, deliver: "variable" },
      { mapType: "offered_value", target: "rulebook_document", deliver: "variable" },
    ],
    // structured literal delivered as a variable
    system_prompt: [
      { mapType: "direct_value", target: { a: 1 }, deliver: "variable" },
    ],
    // a question with no words
    run_notes: [{ mapType: "prompt_user", prompt: "  ", deliver: "variable" }],
    // consumes something not offered
    missing_input: [
      { mapType: "offered_value", target: "no_such_value", deliver: "variable" },
    ],
    // optional with no absence answer
    optional_input: [
      { mapType: "offered_value", target: "prior_clean_text", deliver: "variable" },
    ],
    // "use a default" with no default set
    defaulted_input: [
      {
        mapType: "offered_value",
        target: "prior_clean_text",
        deliver: "variable",
        when_absent: "use_default",
      },
    ],
    // a file joined with another source
    joined_files: [
      { mapType: "offered_value", target: "source_files", deliver: "variable" },
      { mapType: "offered_value", target: "task_overview", deliver: "variable" },
    ],
    // two sources going to different places
    split_channels: [
      { mapType: "offered_value", target: "task_overview", deliver: "variable" },
      { mapType: "direct_value", target: "a literal", deliver: "context" },
    ],
  };
  return consumptionMapProblems({ values: OFFERED }, map, {
    targets: HOLDER_TARGETS,
  });
}

describe("the one-binding UI's refusals speak the person's words, not the machine's keys", () => {
  it("says nothing in snake_case, across every branch of the one pre-flight", () => {
    const problems = everyRefusal();
    // Anti-vacuity: a pre-flight that refused nothing would pass this trivially.
    expect(problems.length).toBeGreaterThanOrEqual(8);
    const speaking = problems.filter(
      (p) => looksLikeCopy(p) && SNAKE_CASE.test(p),
    );
    expect(speaking).toEqual([]);
  });

  it("names the input by the label the row above it renders", () => {
    const problems = everyRefusal();
    expect(
      problems.some((p) => p.includes("Task Overview")),
    ).toBe(true);
    // An explicit label (a context slot carries one) wins over the derivation.
    expect(problems.some((p) => p.includes("Run Notes"))).toBe(true);
  });

  it("the other sentence-writers on the same screens are clean too", () => {
    const sentences: string[] = [
      describeSource({
        mapType: "offered_value",
        target: "task_overview",
        deliver: "variable",
      }),
      describeSource({
        mapType: "direct_value",
        target: "a literal",
        deliver: "variable",
      }),
      describeSource({
        mapType: "prompt_user",
        prompt: "What should this run be about?",
        deliver: "variable",
      }),
      ...parseConsumptionMapWithDrops({
        task_overview: { mapType: "surface_ref", target: "x" },
        run_notes: { mapType: "prompt_user", prompt: "  " },
        prior_clean_text: { mapType: "direct_value", target: null },
        system_prompt: ["not-an-object"],
      }).dropped,
    ];
    expect(sentences.length).toBeGreaterThanOrEqual(7);
    expect(
      sentences.filter((s) => looksLikeCopy(s) && SNAKE_CASE.test(s)),
    ).toEqual([]);
  });

  it("would still catch the exact V2 round-5 sentence", () => {
    // RED-THEN-GREEN, kept executable: the sentence as it shipped on v0.4.1622.
    const shipped =
      '"task_overview" asks the person for this input but has no question — write what the run form should say';
    expect(looksLikeCopy(shipped)).toBe(true);
    expect(SNAKE_CASE.test(shipped)).toBe(true);
    // …and its kind-token sibling.
    const kindShipped =
      '"brief" has structured kind "file_list" — deliver it as context, never as a blob variable';
    expect(SNAKE_CASE.test(kindShipped)).toBe(true);
  });

  it("does not fire on the platform's own address forms or on code", () => {
    // A mandate key is the platform's address form and rides a mono line; the
    // predicate only ever sees SENTENCES, so these must not read as copy.
    expect(looksLikeCopy("mandate.goal_writer")).toBe(false);
    expect(looksLikeCopy("surface_value")).toBe(false);
    expect(looksLikeCopy("features/mandates/provision-shapes.ts")).toBe(false);
  });
});
