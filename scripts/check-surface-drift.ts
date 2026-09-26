#!/usr/bin/env npx tsx
/**
 * check-surface-drift.ts
 *
 * Code-side drift check for the Surface Values system. Compares the
 * registered SurfaceManifests (the source of truth) against the canonical
 * client/surface list shipped with the repo, and surfaces obvious problems
 * agents can fix locally without hitting the database.
 *
 *   pnpm check:surface-drift
 *
 * ALC-14: the checks below are @ai-matrx/alchemy/declare's validateDeclarations
 * (run through features/surfaces/declare/surface-declare.ts, which adds the
 * agent-owned extension validators). This script supplies the app registries.
 *
 * Validates:
 *   1. Every manifest in ALL_MANIFESTS has a unique surfaceName.
 *   2. Every manifest has at least one value declared.
 *   3. Every value within a manifest has a unique name.
 *   4. value.name matches /^[a-z][a-z0-9_]*$/ (matches DB CHECK constraint).
 *   5. value.typicalCharCount is non-negative.
 *   6. value.valueType is one of the allowed enum literals.
 *   7. surfaceName looks like "<client>/<local>" (matches existing convention).
 *   8. agentRoles: role.name matches the same name regex and is unique per
 *      surface; kind is single|multi; maxAgents >= 1 when present;
 *      defaultAgentId is a UUID-shaped string or null; autoRun is one of
 *      always|never|user-choice.
 *   9. configNamespaces: namespace exists in the namespace registry and is
 *      unique per surface.
 *  10. writeTargets: name regex + uniqueness, label/description present,
 *      valueType/mode enums, updatesValue references a declared value,
 *      group references a declared group, and `valueKind` (THE VALUE
 *      CONTRACT) names a kind the generated registry actually carries —
 *      an unknown slug is an ERROR. Structured (object|array) targets with
 *      NO valueKind are counted and printed loudly as an advisory ratchet
 *      (`--list-uncontracted` for the per-surface list); never fatal.
 *  11. clientTools: name regex, unique per surface AND globally across every
 *      manifest (the tool namespace is per CONVERSATION, so a cross-surface
 *      collision is a real defect), label/description present, optional mode
 *      enum, and `inputSchema` conforming to the CustomToolInputSchema wire
 *      shape `{type:"object", properties, required}`.
 *
 * The DB-side drift report (orphan rows, broken mappings) lives behind
 * /api/admin/surfaces/drift-report and isn't checked here — that requires
 * Supabase credentials and is run from the admin UI.
 *
 * Exit codes:
 *   0  all checks pass
 *   1  at least one check failed
 *   2  unexpected import / runtime error
 */
import { resolve } from "node:path";

import { isGeneratedKindSlug } from "../features/content-ir/kinds/generated/kinds.generated";
import { exitAfterDrain } from "./lib/exit-after-drain";


/**
 * The VALUE-CONTRACT RATCHET (WP1, 2026-09-11).
 *
 * Every `object`/`array` write target should name a registered Kind
 * (`SurfaceWriteTarget.valueKind`) — that kind's schema is what the wire
 * advertises, what `applySurfaceWrite` validates against, and what the DB
 * mirror prints to server-side agents. The structured targets that predate
 * the contract can't all be converted at once (most need a kind registered
 * first), so this is an ADVISORY count, printed loudly on every run and never
 * fatal — repo doctrine is scream, never block. The number only goes down.
 */
function reportUncontractedStructuredTargets(
  entries: readonly string[],
  listAll: boolean,
): void {
  if (entries.length === 0) return;
  const bySurface = new Map<string, string[]>();
  for (const entry of entries) {
    const idx = entry.lastIndexOf(":");
    const surface = entry.slice(0, idx);
    const target = entry.slice(idx + 1);
    bySurface.set(surface, [...(bySurface.get(surface) ?? []), target]);
  }
  console.warn("");
  console.warn(
    `⚠️  VALUE CONTRACT: ${entries.length} structured write target${entries.length === 1 ? "" : "s"} (valueType object|array) across ${bySurface.size} surface${bySurface.size === 1 ? "" : "s"} declare NO valueKind.`,
  );
  console.warn(
    "   An agent writing one of these is guessing at the shape, and the only",
  );
  console.warn(
    "   validator is the page handler's own throw. Fix: name a registered kind",
  );
  console.warn(
    "   slug on the target (`valueKind: \"<slug>\"`), or register the kind first",
  );
  console.warn(
    "   (shape-system skill) — never inline a JSON schema. Census + recommended",
  );
  console.warn(
    "   kinds: docs/handoffs/canonical-stream-and-surface-writeback.md",
  );
  if (listAll) {
    for (const [surface, targets] of [...bySurface].sort()) {
      console.warn(`   - ${surface}: ${targets.sort().join(", ")}`);
    }
  } else {
    console.warn(
      "   Run with --list-uncontracted for the per-surface list.",
    );
  }
  console.warn("");
}

async function main() {
  // Lazy import so this script also works as a build artifact; tsx handles
  // the path-alias resolution because the repo's tsconfig.json is picked up
  // by default.
  const mod = await import(
    resolve(__dirname, "..", "features/surfaces/manifests/registry")
  );
  const declare = await import(
    resolve(__dirname, "..", "features/surfaces/declare/surface-declare")
  );
  const nsMod = await import(
    resolve(__dirname, "..", "features/surfaces/config/namespace-registry")
  );
  const listUncontracted =
    process.argv.includes("--list-uncontracted") ||
    process.argv.includes("--uncontracted");

  // ALC-14: every declaration check is the PACKAGE's validation
  // (@ai-matrx/alchemy/declare validateDeclarations) plus the agent-owned
  // extension validators; this script only supplies the app's registries.
  const manifests = declare.toPackageResolved(
    mod.ALL_MANIFESTS,
    mod.getRawManifest,
  );
  const issues: ReadonlyArray<{
    surfaceName: string;
    path: string;
    sentence: string;
    remedy: string;
    severity?: "error" | "advisory";
  }> = declare.validateSurfaceManifests(manifests, {
    knownNamespaces: new Set<string>(nsMod.listRegisteredNamespaces()),
    isKnownKind: isGeneratedKindSlug,
    baselineNames: ["selection", "text_before", "text_after", "content", "context"],
  });
  const errors = issues
    .filter((i) => i.severity !== "advisory")
    .map((i) => `${i.sentence} Fix: ${i.remedy}`);
  const structuredWithoutKind = issues
    .filter((i) => i.severity === "advisory" && i.path.endsWith("/valueKind"))
    .map((i) => `${i.surfaceName}:${i.path.split("/")[1]}`);

  reportUncontractedStructuredTargets(structuredWithoutKind, listUncontracted);

  const ALL = mod.ALL_MANIFESTS as ReadonlyArray<{
    values: readonly unknown[];
    writeTargets?: readonly unknown[];
    clientTools?: readonly unknown[];
  }>;
  if (errors.length === 0) {
    const totalValues = ALL.reduce((sum, m) => sum + m.values.length, 0);
    const totalWriteTargets = ALL.reduce(
      (sum, m) => sum + (m.writeTargets?.length ?? 0),
      0,
    );
    const totalClientTools = ALL.reduce(
      (sum, m) => sum + (m.clientTools?.length ?? 0),
      0,
    );
    console.log(
      `Surface manifests OK: ${ALL.length} surface${ALL.length === 1 ? "" : "s"}, ${totalValues} value${totalValues === 1 ? "" : "s"}, ${totalWriteTargets} write target${totalWriteTargets === 1 ? "" : "s"}, ${totalClientTools} client tool${totalClientTools === 1 ? "" : "s"} declared.`,
    );
    exitAfterDrain(0);
  }

  console.error(
    `Surface manifest drift: ${errors.length} issue${errors.length === 1 ? "" : "s"} found:`,
  );
  for (const e of errors) console.error(`  - ${e}`);
  exitAfterDrain(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  exitAfterDrain(2);
});
