#!/usr/bin/env tsx
/**
 * A SETTING'S CHOICES GET THEIR WORDS FROM THE REGISTRY, NOT FROM A SCREEN.
 *
 * 🚨 WHAT THIS EXISTS FOR (lane FRONT-DOOR, 2026-09-21; the defect is
 * VERIFIER-8 MEDIUM-2). `/data-v2/try-everything` printed, in its header, at a
 * non-technical person:
 *
 *     Set to "all_records", which this screen has no words for
 *
 * The screen carried its own copy of the choices for
 * `custom.member_default_visibility`:
 *
 *     { value: "organization", label: "Everyone in this organization …" },
 *     { value: "shared_only",  label: "People only see what is shared …" },
 *
 * while the registry row admits `["all_records","shared_only"]`. The copy had
 * invented a value the store does not admit and missed the one it does, so the
 * lookup missed and the stored token went on screen verbatim.
 *
 * THE CLASS, not the instance: a component holding its own copy of an enum's
 * words, or turning a stored token into words itself, instead of reading them
 * from the one place they live — `platform.feature_knob` (`allowed_values` for
 * which values are admissible, `ui.options` for what each one is called), read
 * through `knobChoices()` in `lib/scoped-config/choices.ts`.
 *
 * TWO RULES, over the settings doors and the record-store surfaces:
 *
 *   renders-allowed-values-outside-the-one-place — a file other than
 *     `lib/scoped-config/choices.ts` ITERATES or COUNTS a knob's
 *     `allowed_values`. Iterating it is how a raw token reaches a label
 *     (`KnobOverrideRow` offered `hash_only` and `manual_wins` in its select);
 *     counting it separately is how a control can be picked for a different set
 *     of choices than the one the person is shown. Copying the field through
 *     when assembling a row is fine and is not matched.
 *
 *   hardcoded-choice-list — a component declares `{ value: "<token>", label: … }`
 *     for a setting. Those words belong in the registry row, where the person
 *     who owns the setting writes them; a second copy in a screen drifts from
 *     the admissible set the moment either changes, which is exactly what
 *     happened here.
 *
 * `--self-test` plants the EXACT bytes that shipped both halves and requires
 * this guard to go red on them. A guard you cannot show failing is not a guard.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** The knob doors, and the surfaces the record store puts in front of a person. */
const SCOPE = [
  "lib/scoped-config",
  "features/settings/universal",
  "features/unified-data",
  "app/(core)/data-v2",
];

/** THE one place a knob's choices and their words are decided. */
const THE_ONE_PLACE = "lib/scoped-config/choices.ts";

/** Using the admissible set — iterating it or counting it — as opposed to copying it through. */
const RENDERS_ALLOWED_VALUES = /\ballowed_values\b[^\n;]{0,60}?(\.map\(|\.length|\.filter\(|\.forEach\(|\.join\()/;

/** A choice list typed into a component: a lower-case stored token paired with words. */
const HARDCODED_CHOICE = /\{\s*value:\s*["'][a-z][a-z0-9]*(?:_[a-z0-9]+)*["']\s*,\s*label\s*:/;

interface Finding {
  file: string;
  rule: string;
  detail: string;
}

/** Comments describe the rule; only real code is judged. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

function filesIn(root: string, dir: string): string[] {
  const abs = join(root, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(abs, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      out.push(...filesIn(root, join(dir, entry)));
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
    out.push(join(dir, entry));
  }
  return out;
}

function scan(root: string): Finding[] {
  const findings: Finding[] = [];
  for (const dir of SCOPE) {
    for (const rel of filesIn(root, dir)) {
      const normalized = rel.split("\\").join("/");
      let code: string;
      try {
        code = withoutComments(readFileSync(join(root, rel), "utf8"));
      } catch {
        continue;
      }
      if (normalized !== THE_ONE_PLACE && RENDERS_ALLOWED_VALUES.test(code)) {
        findings.push({
          file: normalized,
          rule: "renders-allowed-values-outside-the-one-place",
          detail:
            "this file iterates or counts a knob's `allowed_values` itself. The admissible values are " +
            "stored tokens; the words for them live in the same registry row (`ui.options`). Call " +
            "`knobChoices(knob)` from `lib/scoped-config/choices.ts` — it returns { value, label, help, raw } " +
            "with the registry's own words, and it is the only place allowed to decide what a knob's " +
            "choices are.",
        });
      }
      if (normalized !== THE_ONE_PLACE && HARDCODED_CHOICE.test(code)) {
        findings.push({
          file: normalized,
          rule: "hardcoded-choice-list",
          detail:
            "a choice list with stored tokens and their words is typed into this file. That copy drifts " +
            "from the registry the moment either changes — it is how this screen came to offer a value " +
            "(`organization`) the store does not admit and to print `all_records` at a person. Put the " +
            "words on the knob's registry row (`platform.feature_knob.ui.options`) and render " +
            "`knobChoices(knob)`.",
        });
      }
    }
  }
  return findings;
}

function report(findings: Finding[]): void {
  for (const f of findings) {
    console.error(`[FAIL] ${f.file} — ${f.rule}\n       ${f.detail}`);
  }
}

if (process.argv.includes("--self-test")) {
  // THE EXACT BYTES THAT SHIPPED THE DEFECT, planted in a scratch copy.
  const dir = mkdtempSync(join(tmpdir(), "enum-words-guard-"));
  mkdirSync(join(dir, "features/unified-data/test-bench"), { recursive: true });
  writeFileSync(
    join(dir, "features/unified-data/test-bench/TryEverythingScreen.tsx"),
    [
      "const VISIBILITY_CHOICES: ReadonlyArray<{ value: string; label: string }> = [",
      '    { value: "organization", label: "Everyone in this organization can see the records" },',
      '    { value: "shared_only", label: "People only see what is shared with them" },',
      "];",
      "const visibilityWord =",
      "    visibility === undefined",
      "        ? undefined",
      "        : (VISIBILITY_CHOICES.find((choice) => choice.value === visibility)?.label ??",
      '          `Set to \"${String(visibility)}\", which this screen has no words for`);',
    ].join("\n"),
    "utf8",
  );
  mkdirSync(join(dir, "lib/scoped-config"), { recursive: true });
  writeFileSync(
    join(dir, "lib/scoped-config/KnobOverrideRow.tsx"),
    [
      "  const enumOptions =",
      '    knob.value_type === "enum" || knob.value_type === "boolean"',
      '      ? knob.value_type === "boolean"',
      '        ? ["true", "false"]',
      "        : (knob.allowed_values ?? []).map(String)",
      "      : null;",
    ].join("\n"),
    "utf8",
  );
  const findings = scan(dir);
  const mustCatch = ["hardcoded-choice-list", "renders-allowed-values-outside-the-one-place"];
  const missed = mustCatch.filter((rule) => !findings.some((f) => f.rule === rule));
  if (missed.length > 0) {
    console.error(
      `[FAIL] SELF-TEST: the guard did NOT go red on the exact bytes that shipped the defect ` +
        `(${missed.join(", ")} never fired). A guard that cannot be shown failing proves nothing.`,
    );
    exitAfterDrain(1);
  }
  // The RED output, printed verbatim — a self-test that only says "it failed"
  // asks to be believed. This shows exactly what the guard says on the bytes.
  report(findings);
  console.log(
    `[ OK ] SELF-TEST: the shipped bytes are refused (${findings.length} finding(s)), ` +
      "so this guard is known to be able to fail.",
  );
  exitAfterDrain(0);
}

const findings = scan(ROOT);
if (findings.length > 0) {
  report(findings);
  console.error(
    `\n${findings.length} place(s) keep their own words for a setting's choices. ` +
      "The registry row is where those words live — `knobChoices()` is how a screen reads them.",
  );
  exitAfterDrain(1);
}
const counted = SCOPE.reduce((n, dir) => n + filesIn(ROOT, dir).length, 0);
console.log(
  `A setting's choices get their words from the registry. ` +
    `${counted} file(s) across ${SCOPE.length} surface(s) checked; ` +
    `${relative(ROOT, join(ROOT, THE_ONE_PLACE))} is the one place that decides them.`,
);
exitAfterDrain(0);
