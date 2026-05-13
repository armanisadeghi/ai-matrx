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
 * Validates:
 *   1. Every manifest in ALL_MANIFESTS has a unique surfaceName.
 *   2. Every manifest has at least one value declared.
 *   3. Every value within a manifest has a unique name.
 *   4. value.name matches /^[a-z][a-z0-9_]*$/ (matches DB CHECK constraint).
 *   5. value.typicalCharCount is non-negative.
 *   6. value.valueType is one of the allowed enum literals.
 *   7. surfaceName looks like "<client>/<local>" (matches existing convention).
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

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const SURFACE_NAME_RE = /^[a-z][a-z0-9-]*\/[a-z0-9-/]+$/;
const ALLOWED_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "object",
  "array",
]);

async function main() {
  // Lazy import so this script also works as a build artifact; tsx handles
  // the path-alias resolution because the repo's tsconfig.json is picked up
  // by default.
  const mod = await import(
    resolve(
      __dirname,
      "..",
      "features/tool-registry/surfaces/manifests/registry",
    )
  );
  const ALL_MANIFESTS: ReadonlyArray<{
    surfaceName: string;
    values: ReadonlyArray<{
      name: string;
      label: string;
      description: string;
      valueType: string;
      alwaysAvailable: boolean;
      typicalCharCount: number;
      sortOrder?: number;
    }>;
  }> = mod.ALL_MANIFESTS;

  const errors: string[] = [];
  const seenSurfaces = new Set<string>();

  for (const m of ALL_MANIFESTS) {
    if (seenSurfaces.has(m.surfaceName)) {
      errors.push(
        `Duplicate manifest surfaceName: "${m.surfaceName}" appears more than once.`,
      );
    }
    seenSurfaces.add(m.surfaceName);

    if (!SURFACE_NAME_RE.test(m.surfaceName)) {
      errors.push(
        `Surface "${m.surfaceName}" doesn't match the "<client>/<local>" convention.`,
      );
    }
    if (m.values.length === 0) {
      errors.push(`Surface "${m.surfaceName}" declares no values.`);
      continue;
    }

    const seenValues = new Set<string>();
    for (const v of m.values) {
      if (seenValues.has(v.name)) {
        errors.push(
          `Surface "${m.surfaceName}" declares duplicate value "${v.name}".`,
        );
      }
      seenValues.add(v.name);
      if (!NAME_RE.test(v.name)) {
        errors.push(
          `Surface "${m.surfaceName}" value "${v.name}" doesn't match /^[a-z][a-z0-9_]*$/ — the DB CHECK constraint will reject this.`,
        );
      }
      if (!ALLOWED_TYPES.has(v.valueType)) {
        errors.push(
          `Surface "${m.surfaceName}" value "${v.name}" has invalid valueType "${v.valueType}".`,
        );
      }
      if (typeof v.typicalCharCount !== "number" || v.typicalCharCount < 0) {
        errors.push(
          `Surface "${m.surfaceName}" value "${v.name}" has invalid typicalCharCount.`,
        );
      }
      if (
        v.sortOrder !== undefined &&
        (typeof v.sortOrder !== "number" || v.sortOrder < 0)
      ) {
        errors.push(
          `Surface "${m.surfaceName}" value "${v.name}" has invalid sortOrder.`,
        );
      }
    }
  }

  if (errors.length === 0) {
    const totalValues = ALL_MANIFESTS.reduce(
      (sum, m) => sum + m.values.length,
      0,
    );
    console.log(
      `Surface manifests OK: ${ALL_MANIFESTS.length} surface${ALL_MANIFESTS.length === 1 ? "" : "s"}, ${totalValues} value${totalValues === 1 ? "" : "s"} declared.`,
    );
    process.exit(0);
  }

  console.error(
    `Surface manifest drift: ${errors.length} issue${errors.length === 1 ? "" : "s"} found:`,
  );
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(2);
});
