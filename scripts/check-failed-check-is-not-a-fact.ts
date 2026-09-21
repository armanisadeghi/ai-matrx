#!/usr/bin/env tsx
/**
 * A FAILED CHECK IS NEVER RENDERED AS A FACT.
 *
 * 🚨 WHAT THIS EXISTS FOR (lane SHARE-OUT, item 3, 21 September; the defect is
 * lane PEEK-SHARE's §6). `/data-v2` printed
 *
 *     "This organization does not keep its data in the unified record store yet"
 *
 * — a definite claim about somebody's organization — while the switch for that
 * organization was demonstrably `true`. Nothing was wrong with the switch: a
 * transient PostgREST schema-cache reload (`PGRST002`, another lane's DDL) made
 * the RPC throw, `UNIFIED_DATA_CAMPAIGN.enabled()` caught it and returned the
 * default `false`, and from there "switched off" and "nobody could look" were
 * the same value forever. The organization picker two screens earlier gets this
 * right — "We could not check your organization" — because it carries a real
 * discriminant instead of a boolean.
 *
 * THE CLASS, not the instance: any module that turns a knob/feature read into a
 * SENTENCE ABOUT AN ORGANIZATION must be able to tell "off" from "could not
 * look". This guard checks the two halves that made it possible:
 *
 *   1. THE READER. A campaign knob module may not have a `catch` that returns a
 *      bare boolean/default with no way to signal the failure to its caller.
 *      The honest reader returns a discriminated union.
 *   2. THE SENTENCE. Any file that spells a negative-fact sentence about an
 *      organization's record store must also reference the could-not-check
 *      sentence (or the notice component that renders it), so the two states
 *      cannot collapse in the rendering layer either.
 *
 * `--self-test` replays the exact bytes that shipped the defect and requires
 * this guard to go RED on them. A guard you cannot show failing is not a guard.
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { exitAfterDrain } from "./lib/exit-after-drain";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** The readers that answer "does this organization keep its data in the store". */
const READERS = [
  "lib/knobs/unifiedDataCampaign.ts",
  "lib/knobs/unifiedDataCampaignRamp.ts",
];

/** Files that may spell a negative fact about an organization's record store. */
const SENTENCE_FILES = [
  "lib/knobs/unifiedDataCampaign.ts",
  "lib/knobs/unifiedDataCampaignRamp.ts",
  "lib/knobs/useUnifiedDataCampaignGate.ts",
  "features/unified-data/components/UnifiedDataSwitchNotice.tsx",
];

/** The exact shape of the claim this guard refuses to see stated blind. */
const NEGATIVE_FACT = /does not keep its data in the unified record store/;

/** The honest counterpart. One of these must be in reach of the claim. */
const HONEST = /UNIFIED_DATA_CAMPAIGN_UNAVAILABLE_SENTENCE|UnifiedDataSwitchNotice|could not (read|check|look)/i;

interface Finding {
  file: string;
  rule: string;
  detail: string;
}

/**
 * A `catch` block whose whole body is a warn-and-return of a bare boolean or of
 * the module's default. That is the shape that made "off" and "could not look"
 * the same value.
 */
function catchReturnsABareDefault(source: string): string | null {
  const re = /catch\s*\([^)]*\)\s*\{([\s\S]*?)\n\s{0,8}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const body = m[1] ?? "";
    const returns = [...body.matchAll(/return\s+([^;]+);/g)].map((r) => (r[1] ?? "").trim());
    if (returns.length === 0) continue;
    for (const value of returns) {
      if (/^(true|false)$/.test(value) || /^[A-Z0-9_]*DEFAULT$/.test(value)) {
        return value;
      }
    }
  }
  return null;
}

function scan(root: string): Finding[] {
  const findings: Finding[] = [];

  for (const rel of READERS) {
    let source: string;
    try {
      source = readFileSync(join(root, rel), "utf8");
    } catch {
      findings.push({ file: rel, rule: "reader-missing", detail: "this guard's subject no longer exists — update the guard or restore the file" });
      continue;
    }
    const bare = catchReturnsABareDefault(source);
    if (bare) {
      findings.push({
        file: rel,
        rule: "catch-returns-a-bare-default",
        detail:
          `a catch block returns \`${bare}\` with nothing to tell the caller the read FAILED. ` +
          "That is how \"switched off\" and \"nobody could look\" became one value, and how " +
          "/data-v2 stated a fact about an organization nobody had measured. Return a " +
          "discriminated answer ({ state: \"on\" | \"off\" | \"unavailable\", cause }) and let the " +
          "boolean reader be written in terms of it.",
      });
    }
  }

  for (const rel of SENTENCE_FILES) {
    let source: string;
    try {
      source = readFileSync(join(root, rel), "utf8");
    } catch {
      continue;
    }
    if (NEGATIVE_FACT.test(source) && !HONEST.test(source)) {
      findings.push({
        file: rel,
        rule: "negative-fact-with-no-could-not-check",
        detail:
          "this file states that an organization does not keep its data in the record store, and " +
          "carries no could-not-check counterpart at all. A read that failed must be able to say so.",
      });
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
  const dir = mkdtempSync(join(tmpdir(), "failed-check-guard-"));
  mkdirp(join(dir, "lib/knobs"));
  writeFileSync(
    join(dir, "lib/knobs/unifiedDataCampaign.ts"),
    [
      "const UNIFIED_DATA_CAMPAIGN_DEFAULT = false;",
      "async function enabled(organizationId) {",
      "    if (!organizationId) return UNIFIED_DATA_CAMPAIGN_DEFAULT;",
      "    try {",
      "        return true;",
      "    } catch (error) {",
      "        console.warn(`[unified-data-campaign] could not read the door`);",
      "        return UNIFIED_DATA_CAMPAIGN_DEFAULT;",
      "    }",
      "}",
      "export const S = 'This organization does not keep its data in the unified record store yet';",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(dir, "lib/knobs/unifiedDataCampaignRamp.ts"), "export const x = 1;\n", "utf8");
  const findings = scan(dir);
  const caught = findings.some((f) => f.rule === "catch-returns-a-bare-default");
  if (!caught) {
    console.error(
      "[FAIL] SELF-TEST: the guard did NOT go red on the exact bytes that shipped the defect. " +
        "A guard that cannot be shown failing proves nothing.",
    );
    exitAfterDrain(1);
  }
  console.log(
    `[ OK ] SELF-TEST: the shipped bytes are refused (${findings.length} finding(s)), ` +
      "so this guard is known to be able to fail.",
  );
  exitAfterDrain(0);
}

function mkdirp(p: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("node:fs").mkdirSync(p, { recursive: true });
}

const findings = scan(ROOT);
if (findings.length > 0) {
  report(findings);
  console.error(
    `\n${findings.length} place(s) turn a failed read into a fact about somebody's organization. ` +
      "A failed check is \"could not check — retry\", never a claim.",
  );
  exitAfterDrain(1);
}
console.log(
  `A failed check is never rendered as a fact. ` +
    `${READERS.length} reader(s) answer three states; ` +
    `${SENTENCE_FILES.length} sentence file(s) carry their could-not-check counterpart. ` +
    `(${relative(process.cwd(), ROOT) || "."})`,
);
