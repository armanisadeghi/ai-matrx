#!/usr/bin/env npx tsx
/**
 * check:picker-add — find pickers that offer a closed list of choices with no
 * way for the person to add one.
 *
 * 🚨 THE RULE — P23 (Arman, 2026-08-23, delivered about the exact popover that
 * did this to him):
 *
 *   "We have to annihilate the UIs that offer options but don't allow custom
 *    entry because those are the ones that lose the platform the best users.
 *    Right now, I got inspired to update something and the moment I went in to
 *    assign a tier, I got a pop up that forced me to choose from the shitty
 *    options I had in front of me. So instead of our system getting
 *    significantly better because I took the initiative to add something, our
 *    system was too arrogant and cocky and didn't want my opinion. … No one
 *    will ever know that it was one stupid popover that caused us to leave.
 *    But it's these platform level breaks that destroy everything. It's the
 *    lazy coding agent who builds a popover with a drop down, but is too lazy
 *    to include an add feature."
 *
 * The moment a user wants to teach the system something is the moment of
 * highest value in the whole product. Refusing it converts an advocate into a
 * silent churn risk. Principles: P23 in
 * common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md;
 * the worked write path is `seo.gsc_quick_add_value`.
 *
 * WHAT THIS FLAGS: a component that renders a list of `<SelectItem>` /
 * `<CommandItem>` / `<DropdownMenuItem>` built from DATA (a `.map(` over
 * options, values, a vocabulary, a catalog) and contains no add affordance
 * anywhere in the file — no "+ Add", no "New…", no `Create "`, no call to a
 * quick-add/create path.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG:
 *  - hardcoded UI-mode switches (sort direction, match kind, a view toggle):
 *    a closed set the user could not extend even in principle. Heuristic: the
 *    items are literals, not mapped from data.
 *  - pickers of EXISTING RECORDS the user creates elsewhere and cannot
 *    meaningfully invent inline (a site picker, a user picker) — allowlisted
 *    by path below, with the reason.
 *  - platform-governed vocabularies (P11), where the correct answer is an
 *    explanation + the local-override path, not a create button — those files
 *    must instead mention the override path; the check looks for that too.
 *
 * ADVISORY BY DESIGN (memory: "scream, never block"). It prints findings and
 * exits 0 unless --strict. Run it by name or via `pnpm check:picker-add`.
 */

import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");

/** Where a closed picker is most expensive: surfaces where users teach the system. */
const SCAN_GLOBS = [
  "features/marketing/**/*.tsx",
  "features/agents/**/components/**/*.tsx",
  "features/scopes/**/*.tsx",
  "features/content-ir/**/*.tsx",
];

/**
 * Files where a closed list is CORRECT. Each entry carries its reason — an
 * allowlist without a reason is how a law rots into a formality.
 */
const ALLOW: Array<{ match: RegExp; reason: string }> = [
  { match: /components\/ui\//, reason: "primitive component library — the caller supplies the items" },
  { match: /RangeCompareControl|DateRange|periodPicker/i, reason: "time ranges are a closed set by nature" },
  { match: /SiteSwitcher|BrandSwitcher|OrgSwitcher/i, reason: "picks an existing record created elsewhere; inline creation lives on that record's own surface" },
  { match: /sortDir|SortDirection/i, reason: "ascending/descending is not extensible" },
];

const ADD_AFFORDANCE = [
  /\+\s*(Add|New|Create)/i,
  /["'`]\s*(Add|Create|New)\s+[a-z]/i,
  /Create\s+["'“]/i,
  /quick_add|quickAdd|gsc_quick_add_value/,
  /onCreate|allowCreate|allowOther|creatable|onAddNew|handleCreate/i,
  /facet_value_upsert|facet_dimension_upsert|save_value_vocabulary/,
  // P11 path: the file explains a shared vocabulary and offers the local override
  /your own dimension|platform-governed|shared dimension/i,
];

const ITEM_TAGS = /<(SelectItem|CommandItem|DropdownMenuItem|ComboboxItem)\b/;
/**
 * Items built from data — the signal that the set is extensible in principle.
 * A map over a SCREAMING_CONST is a code-defined closed set (a mode switch, a
 * metric list): not a user vocabulary, so not this law's business. What counts
 * is a map over something that arrived at run time — a query result, props,
 * state, a catalog.
 */
const DATA_DRIVEN =
  /(\.data|\bcatalog\b|\boptions\b|\bvalues\b|\brows\b|\bvocab\w*|\bdimensions\b|\bchoices\b|\bitems\b)[\w?.\[\]]*\s*(\?\?\s*\[\])?\s*\.map\([\s\S]{0,400}?<(SelectItem|CommandItem|DropdownMenuItem|ComboboxItem)\b/;

interface Finding {
  file: string;
  items: number;
}

function scan(): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const pattern of SCAN_GLOBS) {
    let files: string[] = [];
    try {
      files = globSync(pattern, { cwd: ROOT });
    } catch {
      continue;
    }
    for (const rel of files) {
      if (seen.has(rel)) continue;
      seen.add(rel);
      const allowed = ALLOW.find((a) => a.match.test(rel));
      if (allowed) continue;
      let source: string;
      try {
        source = readFileSync(join(ROOT, rel), "utf8");
      } catch {
        continue;
      }
      if (!ITEM_TAGS.test(source)) continue;
      if (!DATA_DRIVEN.test(source)) continue; // literal switches are fine
      if (ADD_AFFORDANCE.some((re) => re.test(source))) continue;
      const items = (source.match(new RegExp(ITEM_TAGS.source, "g")) ?? []).length;
      findings.push({ file: rel, items });
    }
  }
  return findings.sort((a, b) => b.items - a.items);
}

const findings = scan();

if (findings.length === 0) {
  console.log("✓ check:picker-add — every data-driven picker in the scanned surfaces offers a way to add a new option (P23).");
  process.exit(0);
}

console.log("");
console.log("╔══════════════════════════════════════════════════════════════╗");
console.log("║ P23 — PICKERS THAT DO NOT TAKE NEW INPUT                     ║");
console.log("╚══════════════════════════════════════════════════════════════╝");
console.log("");
console.log('  "It\'s the lazy coding agent who builds a popover with a drop down,');
console.log('   but is too lazy to include an add feature." — Arman, 2026-08-23');
console.log("");
console.log(`  ${findings.length} file(s) render choices from data with no add affordance:`);
console.log("");
for (const f of findings) {
  console.log(`  • ${f.file}  (${f.items} item${f.items === 1 ? "" : "s"})`);
}
console.log("");
console.log("  FIX: add an inline '+ Add …' (a type-ahead offering `Create \"what you typed\"`");
console.log("  is the preferred shape), write through the ONE existing path for that");
console.log("  vocabulary, and select the new value immediately. If the vocabulary is");
console.log("  genuinely platform-shared (P11), say so in the control and offer the");
console.log("  local-override path — never a silent refusal.");
console.log("");
console.log(STRICT ? "  --strict: failing." : "  Advisory: this check never blocks a build. It screams so a person acts.");
console.log("");

process.exit(STRICT ? 1 : 0);
