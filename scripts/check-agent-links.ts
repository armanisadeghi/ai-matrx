/**
 * scripts/check-agent-links.ts — NO CALL SITE MAY GUESS AN AGENT'S ADDRESS.
 *
 * THE DEFECT (production, Arman, 2026-09-08):
 *
 *   "When linking to system agents, you cannot link to the same address as
 *    regular agents. A user's agent can be reached with /agents/id but a
 *    system agent cannot… Multiple parts of the page link to agents but they
 *    don't all properly link to the right page depending on it being a system
 *    agent or a user one."
 *
 * A builtin agent lives ONLY under /administration/agents/system-agents/agents.
 * Every hand-built `/agents/${id}` is a bet that the id is a user agent, and
 * ~60 of them were making that bet with ids that came straight out of the
 * database. The address rule now lives in ONE place
 * (`features/agents/addressing/agentAddress.ts`); this keeps it there.
 *
 * WHAT IT FLAGS: an `/agents/${…}` path built from an EXPRESSION (a variable,
 * a row field) anywhere outside the addressing module. A literal path
 * (`/agents/all`, `/agents/new`) is a page, not a record, and is fine.
 *
 * THE ESCAPE, for the flows where the id provably belongs to an agent this
 * code just created as a USER agent (the builder, import, templates):
 *
 *   // agent-link-ok: <why this id can only ever be a user agent>
 *
 * on the line above, or at the end of, the offending line. A bare marker with
 * no reason is itself an offence — the reason is the point.
 *
 * Usage: tsx scripts/check-agent-links.ts [--strict] [--self-test]
 *   exit 0 clean · exit 2 offences (always, under --strict) · exit 3 self-test failed
 */

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/** Files allowed to build an agent path from parts — the rule itself. */
const OWNERS = [
  "features/agents/addressing/agentAddress.ts",
  "features/agents/addressing/agentAddressCache.ts",
  "features/agents/addressing/useAgentHref.ts",
  "scripts/check-agent-links.ts",
];

const SKIP_DIRS = [
  "node_modules/",
  ".next/",
  "app/(dev)/",
  "__tests__/",
  "/unused/",
];

/**
 * `/agents/${…}` or "/agents/" + … in a path position. `/api/agents/…` and
 * `/ai/agents/…` are SERVER endpoints, not addresses — excluded by requiring
 * the path to start the string or follow a quote/backtick.
 */
const OFFENCE = /(^|[`"'(=\s])\/agents\/\$\{/;

const MARKER = /\/\/\s*agent-link-ok:\s*\S+/;

export interface Offence {
  file: string;
  line: number;
  text: string;
}

export function scanSource(file: string, source: string): Offence[] {
  if (OWNERS.some((owner) => file.endsWith(owner))) return [];
  if (SKIP_DIRS.some((dir) => file.includes(dir))) return [];
  const lines = source.split("\n");
  const found: Offence[] = [];
  // A test asserting how a PATHNAME parses is not a link, and a comment is
  // not code — flagging either teaches people to add markers to prose.
  if (/\.test\.tsx?$/.test(file)) return [];
  lines.forEach((text, i) => {
    if (!OFFENCE.test(text)) return;
    const trimmed = text.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    // `/agents/go/${id}` IS the address rule's own always-valid door.
    if (/\/agents\/go\/\$\{/.test(text)) return;
    const excused = MARKER.test(text) || (i > 0 && MARKER.test(lines[i - 1]));
    if (excused) return;
    found.push({ file, line: i + 1, text: text.trim() });
  });
  return found;
}

function repoFiles(): string[] {
  return execSync("git ls-files '*.ts' '*.tsx'", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
}

function selfTest(): boolean {
  const bad = scanSource(
    "features/demo/Thing.tsx",
    'const href = `/agents/${row.agentId}`;',
  );
  const excused = scanSource(
    "features/demo/Thing.tsx",
    "// agent-link-ok: the id was just created by the user's own builder\n" +
      "router.push(`/agents/${newId}/build`);",
  );
  const literal = scanSource(
    "features/demo/Thing.tsx",
    'const href = "/agents/all";',
  );
  const goRoute = scanSource(
    "features/demo/Thing.tsx",
    "const href = `/agents/go/${id}`;",
  );
  return (
    bad.length === 1 &&
    excused.length === 0 &&
    literal.length === 0 &&
    goRoute.length === 0
  );
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    const ok = selfTest();
    console.log(
      ok
        ? "[agent-links] self-test PASSED — the detector still catches a hand-built agent path."
        : "[agent-links] self-test FAILED — the detector no longer catches the original defect.",
    );
    process.exit(ok ? 0 : 3);
  }

  const offences = repoFiles().flatMap((file) => {
    try {
      return scanSource(file, readFileSync(file, "utf8"));
    } catch {
      return [];
    }
  });

  if (offences.length === 0) {
    console.log(
      "[agent-links] OK — every agent address goes through features/agents/addressing.",
    );
    process.exit(0);
  }

  console.error(
    `[agent-links] ${offences.length} hand-built agent path(s). An agent's ` +
      `address depends on its KIND: a builtin agent does NOT live at ` +
      `/agents/<id>. Use agentHrefFromRow() when you hold the row, ` +
      `useAgentHref() when you hold only an id, or agentGoHref() when you ` +
      `need a synchronous href — all from features/agents/addressing. If this ` +
      `id can only ever be a user agent, say why:\n` +
      `    // agent-link-ok: <reason>\n`,
  );
  for (const o of offences) console.error(`  ${o.file}:${o.line}  ${o.text}`);
  process.exit(2);
}

if (require.main === module) main();
