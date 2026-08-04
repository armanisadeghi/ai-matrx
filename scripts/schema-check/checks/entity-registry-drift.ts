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
 * We check the generated mirror (`types/generated/entity-types.generated.ts`)
 * rather than the DB, so this runs fully offline against the committed live
 * snapshot. The mirror is regenerated from `platform.entity_types` itself, so
 * drift here IS registry drift — with one extra failure mode caught for free:
 * a mirror that has gone stale relative to the DB.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { registerCheck } from "../context";
import { classifyGenerated } from "../generated-files";
import type { Context, Finding } from "../types";

const REL = "types/generated/entity-types.generated.ts";

/** `"token": { token: "x", schema: "ai", table: "model_definition", ... }` */
const ROW = /token:\s*"([^"]+)"\s*,\s*schema:\s*"([^"]+)"\s*,\s*table:\s*"([^"]+)"/g;

function check(ctx: Context): Finding[] {
  const abs = join(ctx.root, REL);
  if (!existsSync(abs)) return [];

  const info = classifyGenerated(REL) ?? undefined;
  const findings: Finding[] = [];
  let src: string;
  try {
    src = readFileSync(abs, "utf8");
  } catch {
    return [];
  }

  for (const m of src.matchAll(ROW)) {
    const [, token, schema, table] = m;

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
        location: REL,
        fix: `update platform.entity_types set schema_name='${actual[0]}' where token='${token}'; then \`pnpm gen:entity-types\`.`,
        generated: info,
      });
    } else if (buried) {
      findings.push({
        check: "entity-registry-drift",
        severity: "error",
        message: `entity token "${token}" points at "${schema}.${table}", which has been moved to graveyard. The token is dead but still registered — every access check on it silently denies.`,
        location: REL,
        fix: `De-register the token (set is_active=false / delete the platform.entity_types row) or repoint it deliberately; then \`pnpm gen:entity-types\`.`,
        generated: info,
      });
    } else {
      findings.push({
        check: "entity-registry-drift",
        severity: "error",
        message: `entity token "${token}" points at "${schema}.${table}", and no relation named "${table}" exists in ANY live schema. Either the table was dropped or this mirror is stale.`,
        location: REL,
        fix: `Confirm against the live DB, then de-register the token or fix its target; regenerate with \`pnpm gen:entity-types\` (and \`pnpm check:schema:refresh\` if the snapshot is old).`,
        generated: info,
      });
    }
  }

  return findings;
}

registerCheck("entity-registry-drift", check);
