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

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { MAPPING_STATES } from "./honest-states";

const ARTIFACT = resolve(
  process.cwd(),
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

function main(): void {
  let raw: string;
  try {
    raw = readFileSync(ARTIFACT, "utf8");
  } catch {
    fail(
      `cannot read the engine artifact at ${ARTIFACT}. This guard is UNMEASURED without the matrx-local checkout beside this repo, and an unmeasured guard is not a pass.`,
    );
  }
  const entries = JSON.parse(raw) as ArtifactEntry[];
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

  if (problems.length > 0) {
    for (const p of problems) console.error(`  ${p}`);
    fail(
      `${problems.length} divergence(s) between the engine's honest-state artifact and the browser's table.`,
    );
  }
  console.log(
    `Honest-state parity: OK — ${mapping.length} mapping-scoped states match the engine artifact verbatim.`,
  );
  console.log(
    "Reminder: the live files.sync_mappings.state CHECK is generated from the same artifact by SPEC-SERVER's own test; this guard covers the browser half.",
  );
}

main();
