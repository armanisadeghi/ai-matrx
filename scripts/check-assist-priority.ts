#!/usr/bin/env tsx
/**
 * check:assist-priority — every assist producer writes `priority` through the
 * band helper, never a bare number.
 *
 * Why this guard exists: `platform.assists.priority` was indexed and sorted on
 * for months with no rendered meaning, so producers quietly used it as two
 * different things — an urgency band (0/10/20, which every aidream producer
 * followed) and a raw 0-100 domain severity score. The moment the client
 * started RENDERING bands, the score-scale rows became red "Urgent" chips:
 * a competitor-confirm queue at 80 outranked workflows genuinely blocked on a
 * human decision at 20. Both scales were reasonable in isolation; nothing
 * caught the collision because nothing could see both.
 *
 * A bare `priority: <number>` is exactly that ambiguity returning, so it is
 * the thing this scans for. Loud, never blocking (repo doctrine: scream, don't
 * block) — it prints the file, the line, and the fix.
 *
 * The aidream twin is `assist_priority()` in
 * `aidream/services/assist_support.py`; its producers are checked by reading,
 * not by this script, because it cannot see that repo from here.
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

/** Any file that emits an assist. Producers are named by convention. */
function candidateFiles(): string[] {
  const out = execSync(
    "git grep -l -E 'emitAssist|EmitAssistInput' -- 'features/**/*.ts' 'features/**/*.tsx' || true",
    { encoding: "utf8" },
  );
  return out.split("\n").filter(Boolean);
}

interface Finding {
  file: string;
  line: number;
  text: string;
}

const BARE_PRIORITY = /(^|[^\w.])priority:\s*(\d+)\s*,/;

function scan(file: string): Finding[] {
  const findings: Finding[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    const match = BARE_PRIORITY.exec(text);
    if (!match) return;
    // `priority: 0` inside a fixture/default object is not a producer choice;
    // the helper's own normal band is 0, so it reads identically either way.
    if (match[2] === "0") return;
    findings.push({ file, line: i + 1, text: text.trim() });
  });
  return findings;
}

const findings = candidateFiles().flatMap(scan);

if (findings.length === 0) {
  console.log(
    `${GREEN}[OK]${NC}    Every assist producer builds priority with assistPriority().`,
  );
  process.exit(0);
}

console.log(
  `${RED}✗ ASSIST PRIORITY WRITTEN AS A BARE NUMBER (${findings.length})${NC}`,
);
console.log(
  `${DIM}  priority is an URGENCY BAND the user sees rendered (normal / amber / red),`,
);
console.log(`${DIM}  not a domain severity score. Build it with the helper:${NC}`);
console.log(
  `${DIM}    import { assistPriority } from "@/features/assists/types";${NC}`,
);
console.log(`${DIM}    priority: assistPriority("elevated", 3),${NC}`);
console.log(
  `${DIM}  THE URGENT BAR: something is blocked or failing and only this user`,
);
console.log(`${DIM}  can unblock it. A backlog is never urgent.${NC}\n`);
for (const f of findings) {
  console.log(`  ${YELLOW}${f.file}:${f.line}${NC}  ${f.text}`);
}
console.log(
  `\n${DIM}  Contract: features/assists/FEATURE.md § "Urgency is a BAND over priority".${NC}`,
);
// Advisory by design — never blocks a release.
process.exit(0);
