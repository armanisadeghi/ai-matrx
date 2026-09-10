/**
 * entity-registry-drift — every `platform.entity_types` row must point at a
 * relation that is actually live.
 *
 * This is the quietest drift class in the platform, which is exactly why it
 * needs a guard. `iam.has_access_for_base` resolves an entity token to a
 * (schema, table) via `platform.entity_types`, then reads the row through
 * `platform.entity_row_access_attrs` — which catches EVERY exception
 * (`WHEN others THEN NULL`) and returns `found = false`. So when a table moves
 * schema and the registry row is left behind, nothing errors, nothing logs:
 * the token silently DENIES access to every user, forever.
 *
 * Found live on 2026-08-04: 18 rows still pointed at `reg.*` (renamed to
 * `rag.*`), `user.*` (renamed to `users.*`), or tables since moved to
 * `graveyard`. No log line, no type error, no failing test — the only symptom
 * would have been users quietly unable to reach their own rows.
 *
 * We iterate the INSTALLED `@ai-matrx/associations` vocabulary
 * (`ENTITY_TYPE_METADATA`) rather than the DB, so this runs fully offline
 * against the committed live snapshot. The package vocabulary is generated
 * from `platform.entity_types` itself, so drift here IS registry drift — with
 * one extra failure mode caught for free: an installed package that has gone
 * stale relative to the DB (`pnpm check:entity-types` diffs that directly).
 *
 * Until 2026-09-10 this check regex-scanned a local re-export shim that carried
 * no rows, so it silently passed everything (DC-009). The metadata is now an
 * injectable argument so a planted bad token proves the check can fail
 * (`entity-registry-drift.test.ts`).
 */
import { ENTITY_TYPE_METADATA, type EntityTypeMeta } from "@ai-matrx/associations";
import { registerCheck } from "../context";
import type { Context, Finding } from "../types";

const SOURCE = "@ai-matrx/associations ENTITY_TYPE_METADATA";

/** The minimal per-token shape this check reads. */
export type EntityRegistryRow = Pick<EntityTypeMeta, "schema" | "table"> & { token: string };

export function checkEntityRegistryDrift(
  ctx: Context,
  metadata: Readonly<Record<string, EntityRegistryRow>> = ENTITY_TYPE_METADATA,
): Finding[] {
  const findings: Finding[] = [];

  for (const { token, schema, table } of Object.values(metadata)) {
    const live =
      ctx.snapshot.tables.get(schema)?.has(table) || ctx.snapshot.views.get(schema)?.has(table);
    if (live) continue;

    // Where does that relation actually live now? Drives an exact fix line.
    const actual = [...(ctx.snapshot.relationSchemas.get(table) ?? [])].filter(
      (s) => s !== "graveyard",
    );
    const buried = ctx.snapshot.relationSchemas.get(table)?.has("graveyard") ?? false;

    if (actual.length) {
      findings.push({
        check: "entity-registry-drift",
        severity: "error",
        message: `entity token "${token}" points at "${schema}.${table}", which is not live — "${table}" now lives in ${actual.map((s) => `"${s}"`).join(", ")}. Access checks for this token silently DENY everyone (the resolver swallows the error).`,
        location: SOURCE,
        fix: `update platform.entity_types set schema_name='${actual[0]}' where token='${token}'; then regenerate + patch-release @ai-matrx/associations and \`pnpm up @ai-matrx/associations\`.`,
      });
    } else if (buried) {
      findings.push({
        check: "entity-registry-drift",
        severity: "error",
        message: `entity token "${token}" points at "${schema}.${table}", which has been moved to graveyard. The token is dead but still registered — every access check on it silently denies.`,
        location: SOURCE,
        fix: `De-register the token (set is_active=false / delete the platform.entity_types row) or repoint it deliberately; then regenerate + patch-release @ai-matrx/associations and \`pnpm up @ai-matrx/associations\`.`,
      });
    } else {
      findings.push({
        check: "entity-registry-drift",
        severity: "error",
        message: `entity token "${token}" points at "${schema}.${table}", and no relation named "${table}" exists in ANY live schema. Either the table was dropped or the snapshot / installed package is stale.`,
        location: SOURCE,
        fix: `Confirm against the live DB (\`pnpm check:schema:refresh\` if the snapshot is old, \`pnpm check:entity-types\` for package staleness), then de-register the token or fix its target and patch-release @ai-matrx/associations.`,
      });
    }
  }

  return findings;
}

registerCheck("entity-registry-drift", (ctx) => checkEntityRegistryDrift(ctx));
