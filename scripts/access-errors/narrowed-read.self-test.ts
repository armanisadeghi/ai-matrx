#!/usr/bin/env tsx
/**
 * check:access-errors:self-test — PROVE THE DETECTOR FAILING, THEN PASSING.
 *
 * A guard nobody has watched fire is not a guard. This one is not fed a fixture
 * written to satisfy it: it is fed the REAL BYTES of `getAgentTask` at the two
 * commits that bracket the defect, read straight out of git.
 *
 *   513fb491fc  the first repair. Widened `kind = 'agent'` to
 *               `kind IN ('agent','tool')` and KEPT `sch_agent_task!inner`.
 *               `scheduler.sch_task`'s CHECK constraint is
 *               `kind = ANY (ARRAY['agent','tool','ping'])`, and a ping task has
 *               no agent extension row — so `/schedules/<ping-id>` still told a
 *               platform admin "you don't have access" to a row RLS handed over.
 *               THE DETECTOR MUST FIRE HERE.
 *
 *   HEAD        the read by id and the soft-delete boundary, nothing else.
 *               THE DETECTOR MUST BE SILENT HERE.
 *
 * If either half stops holding, this exits non-zero and says which.
 */
import { execFileSync } from "node:child_process";
import { findNarrowedRecordReads } from "./check-access-errors";

const FILE = "features/scheduling/service/queries.ts";
const BROKEN_AT = "513fb491fc";

function at(rev: string): string {
  return execFileSync("git", ["show", `${rev}:${FILE}`], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

const failures: string[] = [];

// ── Half 1: the detector FIRES on the bytes that shipped the defect ─────────
const before = findNarrowedRecordReads(FILE, at(BROKEN_AT)).filter(
  (f) => f.fn === "getAgentTask",
);
if (before.length === 0) {
  failures.push(
    `The detector did NOT fire on getAgentTask at ${BROKEN_AT}, where the ` +
      `\`kind IN (...)\` filter and the \`sch_agent_task!inner\` join both stood. ` +
      `A detector that cannot see the defect it was built for catches nothing.`,
  );
} else {
  const extras = before[0].extras.join(" ");
  for (const required of ['.in("kind")', "!inner embed"]) {
    if (!extras.includes(required)) {
      failures.push(
        `The detector fired at ${BROKEN_AT} but missed \`${required}\`; it saw: ${extras}`,
      );
    }
  }
}

// ── Half 2: the detector is SILENT on the repaired bytes ────────────────────
const after = findNarrowedRecordReads(FILE, at("HEAD")).filter(
  (f) => f.fn === "getAgentTask",
);
if (after.length > 0) {
  failures.push(
    `The detector still fires on getAgentTask at HEAD: ${after[0].extras.join(" ")}. ` +
      `Either the repair regressed, or the detector reports a predicate that is not a lie.`,
  );
}

if (failures.length > 0) {
  console.error("\x1b[31m[FAIL]\x1b[0m access-errors narrowed-read detector");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "\x1b[32m[ OK ]\x1b[0m narrowed-read detector: fires on " +
    `${BROKEN_AT} getAgentTask (${before[0].extras.join(" ")}), silent at HEAD.`,
);
