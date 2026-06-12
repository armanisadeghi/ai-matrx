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
 *   8. agentRoles: role.name matches the same name regex and is unique per
 *      surface; kind is single|multi; maxAgents >= 1 when present;
 *      defaultAgentId is a UUID-shaped string or null; autoRun is one of
 *      always|never|user-choice.
 *   9. configNamespaces: namespace exists in the namespace registry and is
 *      unique per surface.
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
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "object",
  "array",
]);
const ALLOWED_ROLE_KINDS = new Set(["single", "multi"]);
const ALLOWED_AUTO_RUN = new Set(["always", "never", "user-choice"]);

async function main() {
  // Lazy import so this script also works as a build artifact; tsx handles
  // the path-alias resolution because the repo's tsconfig.json is picked up
  // by default.
  const mod = await import(
    resolve(
      __dirname,
      "..",
      "features/surfaces/manifests/registry",
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
    agentRoles?: ReadonlyArray<{
      name: string;
      label: string;
      description: string;
      kind: string;
      defaultAgentId: string | null;
      maxAgents?: number;
      allowCustom?: boolean;
      autoRun?: string;
      sortOrder?: number;
    }>;
    configNamespaces?: ReadonlyArray<{
      namespace: string;
      label: string;
      description: string;
    }>;
  }> = mod.ALL_MANIFESTS;

  const nsMod = await import(
    resolve(
      __dirname,
      "..",
      "features/surfaces/config/namespace-registry",
    )
  );
  const registeredNamespaces = new Set<string>(
    nsMod.listRegisteredNamespaces(),
  );

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

    const seenRoles = new Set<string>();
    for (const r of m.agentRoles ?? []) {
      if (seenRoles.has(r.name)) {
        errors.push(
          `Surface "${m.surfaceName}" declares duplicate agent role "${r.name}".`,
        );
      }
      seenRoles.add(r.name);
      if (!NAME_RE.test(r.name)) {
        errors.push(
          `Surface "${m.surfaceName}" agent role "${r.name}" doesn't match /^[a-z][a-z0-9_]*$/ — the DB CHECK constraint will reject this.`,
        );
      }
      if (!ALLOWED_ROLE_KINDS.has(r.kind)) {
        errors.push(
          `Surface "${m.surfaceName}" agent role "${r.name}" has invalid kind "${r.kind}" (expected "single" | "multi").`,
        );
      }
      if (
        r.maxAgents !== undefined &&
        (typeof r.maxAgents !== "number" || r.maxAgents < 1)
      ) {
        errors.push(
          `Surface "${m.surfaceName}" agent role "${r.name}" has invalid maxAgents (must be >= 1).`,
        );
      }
      if (
        r.defaultAgentId !== null &&
        (typeof r.defaultAgentId !== "string" || !UUID_RE.test(r.defaultAgentId))
      ) {
        errors.push(
          `Surface "${m.surfaceName}" agent role "${r.name}" has invalid defaultAgentId (must be a UUID or null).`,
        );
      }
      if (r.autoRun !== undefined && !ALLOWED_AUTO_RUN.has(r.autoRun)) {
        errors.push(
          `Surface "${m.surfaceName}" agent role "${r.name}" has invalid autoRun "${r.autoRun}" (expected "always" | "never" | "user-choice").`,
        );
      }
    }

    const seenNamespaces = new Set<string>();
    for (const ns of m.configNamespaces ?? []) {
      if (seenNamespaces.has(ns.namespace)) {
        errors.push(
          `Surface "${m.surfaceName}" declares duplicate config namespace "${ns.namespace}".`,
        );
      }
      seenNamespaces.add(ns.namespace);
      if (!registeredNamespaces.has(ns.namespace)) {
        errors.push(
          `Surface "${m.surfaceName}" references config namespace "${ns.namespace}" which is not registered in features/surfaces/config/namespace-registry.ts.`,
        );
      }
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
