#!/usr/bin/env npx tsx
/**
 * scripts/check-hr-time-arithmetic.ts — L3-75.
 *
 * 🚨 THE LAW THIS ENFORCES
 * ------------------------
 * **No client computes hours, overtime, premiums, rounding, categorization or a weighted average**
 * (SPEC-TIME §0 law 6, §1.4, §9.2; R-L3 L3-74). Every payable number on a Time & Attendance surface
 * arrives already computed and snapshot-backed from `hr.work_interval` / `hr.workweek` or from
 * `POST /hr/calc/*`. The one permitted client-side figure in the whole lane is a **preview** total
 * from a `prospective` calc call, visibly labelled as a preview.
 *
 * SPEC-TIME §9.2 states the consequence in one sentence, and it is the reason this file exists:
 *
 * > *"Subtracting `ended_at − started_at` in the browser produces 8 hours for a spring-forward
 * > night shift that was 7 (fixture `OT-DST-01`) — and it is a defect wherever it appears."*
 *
 * A rule that lives only in a spec is a rule that survives exactly as long as the person who read
 * it. **A lint rule is how it stays a defect.**
 *
 * WHAT IT SCANS
 * -------------
 * `features/hr/time/**` and `app/(kiosk)/**` — the two trees SPEC-TIME §9.2 and acceptance target
 * T-14 name. Nothing else: this is a lane gate, not a repo-wide sweep, and widening it to trees it
 * was never reasoned about would produce noise that trains people to ignore it.
 *
 * WHAT IT LOOKS FOR
 * -----------------
 *   1. Timestamp subtraction on an interval / punch / shift field — the `ended_at − started_at`
 *      family, in every spelling a browser can express it (`.getTime() -`, `Date.parse(a) - `,
 *      `+new Date(a) - `, `endedAt - startedAt`).
 *   2. A date-library elapsed helper (`differenceInMinutes`, `differenceInHours`, `intervalToDuration`,
 *      `formatDistance…`, dayjs `.diff(`, luxon `.diffNow(`) applied anywhere in these trees.
 *   3. Hours × rate — the amount a client must never produce, because money is ABSENT when a
 *      contributing rule is advisory and a browser cannot know that.
 *   4. Summing hours across rows (`reduce` over an `hours` member) — a week total a client derived
 *      is a week total that will disagree with the workweek row the moment a boundary week,
 *      a supersession or a premium line exists.
 *
 * THE ESCAPE HATCH IS EXPLICIT, NAMED, AND REQUIRES A REASON
 * -----------------------------------------------------------
 * Two legitimate exceptions exist and both are enumerated in {@link ALLOWLIST} by exact path:
 * the live "time since clock-in" ticker (which advances the SERVER's elapsed value by this
 * browser's own wall clock and touches no punch timestamp), and this file itself. Anything else
 * needs an inline marker on the offending line:
 *
 *     const ms = b.getTime() - a.getTime(); // hr-time-arithmetic-allow: <why this is not hours>
 *
 * A marker with no reason after the colon is **still reported**, because "allow" with no argument
 * is how an escape hatch becomes a habit.
 *
 * EXIT BEHAVIOUR
 * --------------
 * Loud, and **advisory by default** — `exit 0` — matching `scripts/check-retired-db-ref.ts` and the
 * repo's scream-never-block rule. `--strict` exits 1 on any finding, and that is the form the
 * strict release-gate section runs.
 *
 * FALSIFIABILITY. A gate that cannot go red is worse than no gate, because it manufactures
 * confidence. This one was proven by planting a known-bad line, watching it report, and removing
 * it — see `features/hr/time/periods/FEATURE.md` § The gate, and its falsifiability proof.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");

/** The two trees SPEC-TIME §9.2 / T-14 name. Widening this is a deliberate act, not a tidy-up. */
const SCAN_ROOTS = ["features/hr/time", "app/(kiosk)"];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".next-preview",
  "out",
  "dist",
  "coverage",
  "__fixtures__",
]);

const SCAN_EXTENSIONS = [".ts", ".tsx"];

/** Bigger than any hand-written source file in these trees; a generated blob is not our business. */
const MAX_FILE_BYTES = 2_000_000;

/**
 * The named exceptions, by exact repo-relative path. Each carries the reason it is legitimate,
 * because an allowlist entry with no reason is indistinguishable from an oversight.
 */
const ALLOWLIST: Record<string, string> = {
  "scripts/check-hr-time-arithmetic.ts":
    "This gate. Its own patterns are the thing it looks for.",
  "features/hr/time/clock/liveElapsed.ts":
    "The live 'time since clock-in' DISPLAY, driven from the server's elapsed value. It advances " +
    "hr.clock_state's elapsedWorkedMinutes by this browser's own wall clock and touches no punch " +
    "timestamp, so no calendar arithmetic happens and a DST transition cannot corrupt it. It " +
    "renders LIVE_DISPLAY_DISCLAIMER beside the number, always.",
};

/** The inline escape hatch. The reason after the colon is required and is checked for. */
const ALLOW_MARKER = /hr-time-arithmetic-allow:\s*(\S.*)?$/;

interface Rule {
  id: string;
  /** What the reader must understand, not just what matched. */
  why: string;
  pattern: RegExp;
  /** Lines this rule must not fire on — a prose mention is not an implementation. */
  exempt?: RegExp;
}

/**
 * The interval / punch / shift time members. A subtraction between two of THESE is the defect;
 * `now - responseReceivedAt` between two browser clocks is not, which is why the rule is written
 * against the field vocabulary rather than against the minus sign.
 */
const TIME_FIELD =
  "(?:started_?At|ended_?At|occurred_?At|deviceReported_?At|device_reported_at|serverReceived_?At|" +
  "server_received_at|clockIn|clock_in|clockOut|clock_out|punchAt|punch_at|rawStarted_?At|" +
  "rawEnded_?At|scheduledStart_?At|scheduled_start_at|scheduledEnd_?At|scheduled_end_at|" +
  "actualStart_?At|actualEnd_?At|weekStart_?At|weekEnd_?At|coversFrom|covers_from|coversTo|covers_to)";

const RULES: Rule[] = [
  {
    id: "interval-subtraction",
    why:
      "Elapsed time derived from two stamped instants. SPEC-TIME §9.2: this returns 8 for a " +
      "spring-forward night shift that was 7. Render hr.work_interval.hours instead.",
    pattern: new RegExp(
      `${TIME_FIELD}[^\\n]{0,80}?\\)?\\s*-\\s*[^\\n]{0,40}?${TIME_FIELD}`,
      "i",
    ),
  },
  {
    id: "getTime-pair",
    why:
      "A `.getTime()` / `Date.parse` / `+new Date()` pair subtracted. Two epoch numbers is the " +
      "same defect wearing a nicer hat — the DST hour is missing from both.",
    pattern:
      /(?:\.getTime\(\)|Date\.parse\([^)]*\)|\+\s*new Date\([^)]*\))\s*-\s*(?:.*(?:\.getTime\(\)|Date\.parse\(|\+\s*new Date\())/,
  },
  {
    id: "date-lib-elapsed",
    why:
      "A date library's elapsed helper. Every one of these does wall-clock arithmetic the engine " +
      "already did correctly against the punch's stamped IANA zone.",
    pattern:
      /\b(?:differenceInMinutes|differenceInHours|differenceInSeconds|differenceInMilliseconds|differenceInDays|differenceInBusinessDays|intervalToDuration|eachMinuteOfInterval|milliseconds|dayjs\([^)]*\)\.diff|\.diffNow\(|Duration\.fromMillis)\s*\(/,
  },
  {
    id: "hours-times-rate",
    why:
      "An amount computed in a browser. Money is ABSENT when a contributing rule is advisory " +
      "(SPEC-TIME §0 law 4) and a client cannot know that — it would render a confident wrong " +
      "number where the contract requires no number at all.",
    pattern:
      /\b(?:hours|hoursWorked|hoursOvertime|hoursDoubletime|totalHours|approvedHours|requestedHours)\b\s*\*|(?:\*\s*\b(?:rate|payRate|hourlyRate|weightedAverageRegularRate|regularRate)\b)/,
  },
  {
    id: "hours-summed",
    why:
      "A total derived by summing rows. The authoritative week total is hr.workweek's, and a " +
      "client sum disagrees with it the moment a boundary week, a supersession or a premium line " +
      "exists.",
    pattern:
      /\.reduce\s*\([^)]*\)\s*=>[^\n]*\b(?:hours|totalHours|hoursOvertime|hoursDoubletime)\b|\.reduce\s*\(\s*\([^)]*\b(?:hours|totalHours)\b/,
  },
];

interface Finding {
  file: string;
  line: number;
  ruleId: string;
  why: string;
  text: string;
}

const findings: Finding[] = [];
const scannedFiles: string[] = [];
/** Escape-hatch markers that carried no reason — reported, never silently honoured. */
const unreasonedMarkers: Finding[] = [];

function walk(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = resolve(dir, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      continue;
    }
    if (stats.isDirectory()) {
      walk(full);
      continue;
    }
    if (!SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
    if (stats.size > MAX_FILE_BYTES) continue;
    scanFile(full);
  }
}

/**
 * Blank the CONTENTS of single- and double-quoted strings, keeping the quotes and the line length.
 *
 * Without this the gate reports itself into uselessness on its very first real run: a fixture line
 * reading `coversFrom: "2026-03-19T00:00:00Z", coversTo: "2026-03-20T00:00:00Z"` matches the
 * field-minus-field rule, because the hyphen inside an ISO DATE is a minus sign as far as a regex is
 * concerned. Ten such false positives is how a gate becomes noise somebody learns to skip, and a
 * gate people skip is worse than no gate at all.
 *
 * Backticks are deliberately left alone: a template literal can contain real `${a - b}` code.
 */
function blankStringLiterals(line: string): string {
  return line.replace(/(['"])(?:\\.|(?!\1)[^\\])*\1/g, (match) =>
    `${match[0]}${" ".repeat(Math.max(0, match.length - 2))}${match[match.length - 1]}`,
  );
}

/**
 * A line that only TALKS about the defect is not the defect. Every doc block in this lane quotes
 * `ended_at − started_at` on purpose — the law is written down beside the code it binds — so a gate
 * that reported those would report the very comments that keep the rule alive.
 */
function isProse(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("*") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    // The typographic minus is only ever used in prose; code cannot contain it.
    trimmed.includes("−")
  );
}

function scanFile(fullPath: string): void {
  const rel = relative(ROOT, fullPath);
  if (ALLOWLIST[rel]) return;

  let source: string;
  try {
    source = readFileSync(fullPath, "utf8");
  } catch {
    return;
  }
  scannedFiles.push(rel);

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isProse(line)) continue;

    const marker = ALLOW_MARKER.exec(line);
    const hasReason = Boolean(marker?.[1]?.trim());
    // Patterns run against CODE, not against string contents. The reported text stays the original.
    const code = blankStringLiterals(line);

    for (const rule of RULES) {
      if (rule.exempt?.test(code)) continue;
      if (!rule.pattern.test(code)) continue;

      const finding: Finding = {
        file: rel,
        line: i + 1,
        ruleId: rule.id,
        why: rule.why,
        text: line.trim().slice(0, 160),
      };

      if (marker && hasReason) break; // legitimately excused, with its reason on the line
      if (marker && !hasReason) {
        unreasonedMarkers.push(finding);
        break;
      }
      findings.push(finding);
      break; // one finding per line — the first rule that matched is the one to explain
    }
  }
}

// ---------------------------------------------------------------------------------------------

const argv = process.argv.slice(2);
const strict = argv.includes("--strict");
const asJson = argv.includes("--json");

for (const root of SCAN_ROOTS) {
  walk(resolve(ROOT, root));
}

const total = findings.length + unreasonedMarkers.length;

if (asJson) {
  process.stdout.write(
    `${JSON.stringify(
      { scanRoots: SCAN_ROOTS, filesScanned: scannedFiles.length, findings, unreasonedMarkers },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

if (total === 0) {
  process.stdout.write(
    `${GREEN}[OK]${NC} No client-side elapsed-time or money arithmetic in ` +
      `${SCAN_ROOTS.join(" + ")} (${scannedFiles.length} files scanned).\n`,
  );
  process.exit(0);
}

process.stdout.write(
  `\n${RED}🚨 CLIENT-SIDE TIME ARITHMETIC — ${total} finding(s) in ${scannedFiles.length} files${NC}\n\n` +
    `${DIM}NO CLIENT COMPUTES HOURS, OVERTIME, PREMIUMS, ROUNDING OR A WEIGHTED AVERAGE.\n` +
    `SPEC-TIME §9.2: subtracting ended_at − started_at in a browser returns 8 hours for a\n` +
    `spring-forward night shift that was 7 (fixture OT-DST-01). Render the server's number.${NC}\n\n`,
);

const byRule = new Map<string, Finding[]>();
for (const f of findings) {
  const bucket = byRule.get(f.ruleId) ?? [];
  bucket.push(f);
  byRule.set(f.ruleId, bucket);
}

for (const [ruleId, bucket] of byRule) {
  process.stdout.write(`${RED}${ruleId}${NC} — ${bucket[0].why}\n`);
  for (const f of bucket) {
    process.stdout.write(`  ${f.file}:${f.line}\n      ${DIM}${f.text}${NC}\n`);
  }
  process.stdout.write("\n");
}

if (unreasonedMarkers.length > 0) {
  process.stdout.write(
    `${YELLOW}unreasoned-allow${NC} — an \`hr-time-arithmetic-allow:\` marker with no reason after ` +
      `the colon. "Allow" with no argument is how an escape hatch becomes a habit; write why this ` +
      `is not hours.\n`,
  );
  for (const f of unreasonedMarkers) {
    process.stdout.write(`  ${f.file}:${f.line}\n      ${DIM}${f.text}${NC}\n`);
  }
  process.stdout.write("\n");
}

process.stdout.write(
  `${DIM}How to fix: read the number from hr.work_interval.hours / hr.workweek, or call\n` +
    `POST /hr/calc/overtime (prospective, labelled a preview). If a line genuinely is not hours\n` +
    `arithmetic, mark it \`// hr-time-arithmetic-allow: <why>\` — with the reason.${NC}\n`,
);

process.exit(strict ? 1 : 0);
