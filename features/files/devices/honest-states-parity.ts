/**
 * features/files/devices/honest-states-parity.ts
 *
 * THE GUARD for the honest-state vocabulary. Run it:
 *
 *   pnpm tsx features/files/devices/honest-states-parity.ts
 *
 * Three things must say the same words about the same condition
 * (SPEC-ENGINE §3.6, C3):
 *
 *   1. the engine's generated artifact,
 *      `../matrx-local/crates/matrx-sync/contracts/honest_states.json`
 *      — the single source of the values and the TITLES;
 *   2. the live `files.sync_mappings.state` CHECK constraint, which SPEC-SERVER
 *      generates from the mapping-scoped subset of that artifact;
 *   3. `features/files/devices/honest-states.ts`, what this browser renders.
 *
 * It needs the matrx-local checkout as a sibling of this repo (the same shape
 * `check:realtime-publication` needs the aidream checkout). A missing checkout
 * is UNMEASURED and therefore a FAILURE — never a quiet pass.
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { MAPPING_STATES } from "./honest-states";

// A parity CHECK SCRIPT (run by hand / release gates), never a Next.js
// module; its root is the sibling matrx-local checkout, which is dynamic, so
// the trace boundary is declared explicitly — see docs/BUILD-TIME-TURBOPACK.md.
const ARTIFACT =
  process.env.HONEST_STATES_ARTIFACT ??
  resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "../matrx-local/crates/matrx-sync/contracts/honest_states.json",
  );

interface ArtifactEntry {
  value: string;
  scopes: string[];
  title: string;
  remedy_action: string | null;
}

function fail(message: string): never {
  console.error(`\nFAIL — ${message}\n`);
  process.exit(1);
}

/** The comparison itself — every divergence, in both directions. */
function diff(entries: ArtifactEntry[]): { problems: string[]; count: number } {
  const mapping = entries.filter((e) => e.scopes.includes("mapping"));
  const artifactByValue = new Map(mapping.map((e) => [e.value, e]));
  const ourByValue = new Map(MAPPING_STATES.map((s) => [s.value, s]));

  const problems: string[] = [];
  for (const entry of mapping) {
    const ours = ourByValue.get(entry.value);
    if (!ours) {
      problems.push(
        `the engine emits mapping state '${entry.value}' ("${entry.title}") and the browser renders no entry for it`,
      );
      continue;
    }
    if (ours.title !== entry.title)
      problems.push(
        `title drift on '${entry.value}': engine "${entry.title}" vs browser "${ours.title}"`,
      );
    if ((ours.remedyAction ?? null) !== (entry.remedy_action ?? null))
      problems.push(
        `remedy action drift on '${entry.value}': engine ${String(entry.remedy_action)} vs browser ${String(ours.remedyAction)}`,
      );
  }
  for (const ours of MAPPING_STATES)
    if (!artifactByValue.has(ours.value))
      problems.push(
        `the browser renders '${ours.value}', which is not a mapping-scoped state in the engine artifact`,
      );
  return { problems, count: mapping.length };
}

function readArtifact(path: string): ArtifactEntry[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    fail(
      `cannot read the engine artifact at ${path}. This guard is UNMEASURED without the matrx-local checkout beside this repo, and an unmeasured guard is not a pass.`,
    );
  }
  return JSON.parse(raw) as ArtifactEntry[];
}

/**
 * THE GUARD CAN STILL FAIL. Plants two real drifts — a reworded title and a
 * state the engine emits that the browser does not render — into a COPY of
 * the live artifact and proves each is caught. A guard nobody has seen go red
 * is a decoration.
 */
function selfTest(): void {
  const entries = readArtifact(ARTIFACT);
  const clean = diff(entries);
  if (clean.problems.length > 0)
    fail(
      `the self-test needs a clean baseline, and the live artifact already disagrees with the browser (${clean.problems.length} problem(s)). Fix the real drift first: pnpm check:honest-states-parity`,
    );

  const dir = mkdtempSync(join(tmpdir(), "honest-states-selftest-"));
  const mapping = entries.filter((e) => e.scopes.includes("mapping"));
  const victim = mapping[0];
  if (!victim) fail("the artifact carries no mapping-scoped state to drift.");

  const cases: Array<{ name: string; entries: ArtifactEntry[] }> = [
    {
      name: "a reworded title",
      entries: entries.map((e) =>
        e.value === victim.value ? { ...e, title: `${e.title} (drifted)` } : e,
      ),
    },
    {
      name: "a state the browser does not render",
      entries: [
        ...entries,
        {
          value: "__selftest_new_state",
          scopes: ["mapping"],
          title: "A state this browser has never heard of",
          remedy_action: null,
        },
      ],
    },
    {
      name: "a remedy action that moved",
      entries: entries.map((e) =>
        e.value === victim.value
          ? { ...e, remedy_action: "__selftest_remedy" }
          : e,
      ),
    },
  ];

  for (const [index, planted] of cases.entries()) {
    const path = join(dir, `artifact-${index}.json`);
    writeFileSync(path, JSON.stringify(planted.entries));
    const result = diff(readArtifact(path));
    if (result.problems.length === 0)
      fail(
        `SELF-TEST FAILED: the guard reported no problem with ${planted.name} planted. It cannot catch the drift it exists for.`,
      );
    console.log(
      `  caught ${planted.name}: ${result.problems[0] ?? "(no detail)"}`,
    );
  }
  console.log(
    `\nSELF-TEST PASSED — the guard goes red on all ${cases.length} planted drifts and green on the live artifact (${clean.count} mapping-scoped states).`,
  );
}

function main(): void {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const entries = readArtifact(ARTIFACT);
  const { problems, count } = diff(entries);
  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    fail(
      `${problems.length} divergence(s) between the engine's honest-state artifact and the browser's table.`,
    );
  }
  console.log(
    `Honest-state parity: OK — ${count} mapping-scoped states match the engine artifact verbatim.`,
  );
  console.log(
    "Reminder: the live files.sync_mappings.state CHECK is generated from the same artifact by SPEC-SERVER's own test; this guard covers the browser half.",
  );
}

main();
