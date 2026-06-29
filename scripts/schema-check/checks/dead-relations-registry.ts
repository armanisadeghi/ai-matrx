/**
 * dead-relations-registry — keep the registry itself honest against live truth.
 *
 * scripts/dead-relations.json drives the dead-relations check and the db-change
 * skills' repoint instructions. If an entry's declared NEW home is wrong (e.g.
 * "moved to reg" when the table actually lives in "rag"), every agent it guides
 * gets sent to a schema that doesn't exist. This check diffs each entry's new
 * home against the live snapshot and flags the registry when they disagree.
 *
 * The JSON is a mirror of platform.deprecated_relations, so findings carry the
 * generated flag — the real fix is in the DB registry, then re-sync.
 */
import { registerCheck } from "../context";
import { classifyGenerated } from "../generated-files";
import { relationExists } from "../snapshot";
import type { Context, Finding } from "../types";

const REL = "scripts/dead-relations.json";

function check(ctx: Context): Finding[] {
  const { snapshot: snap } = ctx;
  if (snap.provenance === "none" || snap.tables.size === 0) return [];
  const info = classifyGenerated(REL)!;
  const findings: Finding[] = [];

  for (const e of ctx.deadRelations) {
    // The new home may be a RENAME/MERGE into a differently-named table, so validate
    // the NEW table name (from `new`), not the old relation name.
    const [newSchema, newTable] = (e.new ?? `${e.newSchema}.${e.relation}`).split(".");
    if (relationExists(snap, newSchema ?? e.newSchema, newTable ?? e.relation)) continue; // new home exists → fine
    // The new home is not live. Where does that new table actually live?
    const actual = [...(snap.relationSchemas.get(newTable ?? e.relation) ?? [])].sort();
    if (actual.length && !actual.includes(newSchema ?? e.newSchema)) {
      findings.push({
        check: "dead-relations-registry",
        severity: "error",
        message: `entry "${e.old}" declares new home "${e.new}", but it is not live there — "${newTable}" actually lives in ${actual.map((s) => `"${s}"`).join(", ")}.`,
        location: REL,
        fix: `Fix the new home to "${actual[0]}.${newTable}" here AND in platform.deprecated_relations; repoint callsites to .schema("${actual[0]}").`,
        generated: info,
      });
    } else if (!actual.length && ctx.warn) {
      findings.push({
        check: "dead-relations-registry",
        severity: "warn",
        message: `entry "${e.old}" → "${e.new}": the new home is not live and "${newTable}" is not found in any live schema (renamed/dropped, or snapshot stale?).`,
        location: REL,
        generated: info,
      });
    }
  }
  return findings;
}

registerCheck("dead-relations-registry", check);
