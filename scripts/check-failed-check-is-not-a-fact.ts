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

/**
 * The exact shape of the claim this guard refuses to see stated blind.
 *
 * TWO SPELLINGS, because the ruling of 2026-09-23 changed the words and not the class.
 * STORE-ON moved the platform default to ON, so the off sentence stopped being "does not
 * keep its data in the unified record store YET" and became "has its record store switched
 * off". A guard keyed on the retired spelling alone would have gone quietly green over the
 * live sentence — the same silence it exists to prevent — so the old wording stays here
 * (nothing may reintroduce it blind either) and the new one is added beside it.
 */
const NEGATIVE_FACT =
  /does not keep its data in the unified record store|has its record store switched off/;

/** The honest counterpart. One of these must be in reach of the claim. */
const HONEST = /UNIFIED_DATA_CAMPAIGN_UNAVAILABLE_SENTENCE|UnifiedDataSwitchNotice|could not (read|check|look)/i;

/**
 * 🚨 THE SECOND HALF, ADDED 2026-09-21 (lane FRONT-DOOR; the defect is
 * VERIFIER-8 HIGH-1).
 *
 * The same class came back on the owner's own "everything the record store can
 * do" page. `/data-v2/try-everything` section 16 printed "Not built yet" for
 * the pipeline, quoted an access refusal as though the store had said it about
 * the owner's organization, and named a blocker that was not the blocker —
 * because the page probed `custom.pipeline_read` with the ZERO UUID. Asked
 * about a real table, all seven pipeline doors answer correctly.
 *
 * Two rules, and they are the whole of it:
 *
 *   probe-asks-about-a-fabricated-id — a probe on this page may not pass an
 *     all-zero (or otherwise invented) identifier to a door. A section with
 *     nothing real to ask about says so; it does not make something up and then
 *     report the store's correct refusal as a verdict.
 *
 *   refusal-rendered-as-absence — a refusal handler may not set a capability to
 *     `there: false`. A door that refuses is a door that is INSTALLED AND
 *     ANSWERING, so its refusal can never be evidence that the feature is
 *     missing. It is "could not check", with the refusal quoted as what got in
 *     the way.
 */
const PROBE_FILES = [
  "features/unified-data/test-bench/TryEverythingScreen.tsx",
];

/** An identifier nobody could have read from the live system. */
const FABRICATED_ID = /["'`]0{8}-0{4}-0{4}-0{4}-0{12}["'`]/;

/**
 * A handler that reads a door's refusal and then declares the thing absent. It
 * is matched as a unit — `refused`/`error`/`refusalLineForAPerson` within a few
 * lines of a `there: false` — because either half alone is legitimate.
 */
const REFUSAL_AS_ABSENCE =
  /there:\s*false[\s\S]{0,400}?refusalLineForAPerson|refusalLineForAPerson[\s\S]{0,400}?there:\s*false/;

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

  for (const rel of PROBE_FILES) {
    let source: string;
    try {
      source = readFileSync(join(root, rel), "utf8");
    } catch {
      findings.push({
        file: rel,
        rule: "probe-file-missing",
        detail: "this guard's subject no longer exists — update the guard or restore the file",
      });
      continue;
    }
    if (FABRICATED_ID.test(source)) {
      findings.push({
        file: rel,
        rule: "probe-asks-about-a-fabricated-id",
        detail:
          "a door on this page is probed with an all-zero identifier. The store then correctly refuses a " +
          "thing that does not exist, and the page prints that refusal as if it described the reader's own " +
          "organization — which is how section 16 came to say \"Not built yet\" about seven doors that are " +
          "installed and answering. Probe a REAL object of the current organization, or pass `cannotRun` " +
          "with the one sentence saying why this cannot be checked.",
      });
    }
    if (REFUSAL_AS_ABSENCE.test(source)) {
      findings.push({
        file: rel,
        rule: "refusal-rendered-as-absence",
        detail:
          "a door's refusal is turned into `there: false`. A door that refuses is INSTALLED AND ANSWERING, " +
          "so its refusal is an answer about the question asked, never evidence that the feature is missing. " +
          "Set `there: null` (\"could not check — …\") and quote the refusal as what got in the way. The only " +
          "honest `there: false` on that page is the package not carrying the call at all.",
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
  // THE SECOND SET OF SHIPPED BYTES — `/data-v2/try-everything` as VERIFIER-8
  // read it on 2026-09-21: the zero-UUID probe, and the refusal handler that
  // declared the pipeline absent.
  mkdirp(join(dir, "features/unified-data/test-bench"));
  writeFileSync(
    join(dir, "features/unified-data/test-bench/TryEverythingScreen.tsx"),
    [
      "const pipelineDoors = useDoor({",
      '    needs: ["pipelineRead", "pipelineBoard"],',
      '    ask: (client) => client.pipelineRead({ table_id: workingTable?.id ?? ("00000000-0000-0000-0000-000000000000" as never) }),',
      '    whenItAnswers: "The pipeline doors answer this browser.",',
      '    whatWouldMakeItAppear: "the screens package carrying the pipeline doors.",',
      "});",
      "setCapability({",
      "    there: false,",
      "    because: `The door is here but it refused just now — ${refusalLineForAPerson(answered.error)}`,",
      "    whatWouldMakeItAppear,",
      "});",
    ].join("\n"),
    "utf8",
  );
  const findings = scan(dir);
  const mustCatch = [
    "catch-returns-a-bare-default",
    "probe-asks-about-a-fabricated-id",
    "refusal-rendered-as-absence",
  ];
  const missed = mustCatch.filter((rule) => !findings.some((f) => f.rule === rule));
  if (missed.length > 0) {
    console.error(
      `[FAIL] SELF-TEST: the guard did NOT go red on the exact bytes that shipped the defect ` +
        `(${missed.join(", ")} never fired). A guard that cannot be shown failing proves nothing.`,
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
    `${SENTENCE_FILES.length} sentence file(s) carry their could-not-check counterpart; ` +
    `${PROBE_FILES.length} probe page(s) ask about real objects and never render a refusal as an absence. ` +
    `(${relative(process.cwd(), ROOT) || "."})`,
);
