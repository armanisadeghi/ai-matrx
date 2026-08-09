/**
 * ONE message builder for a dead-end finding — consumed by the CLI report AND
 * by the admin dashboard.
 *
 * It lives here, not in either consumer, for two reasons. First, reuse-first:
 * a second copy of this prose would drift the day someone improves the CLI
 * wording and forgets the dashboard. Second, size: storing 472 rendered
 * sentences in `report.json` tripled the committed file for zero information —
 * the fields already say everything, so the sentence is derived, never stored.
 *
 * Pure and dependency-free so a client component can import it.
 */

import type { DeadEndFinding, DeadEndRuleId } from "./types";

/** The finding fields the message needs — a structural subset, so callers can
 *  pass a full finding or a row projection. */
export type DescribableFinding = Pick<
  DeadEndFinding,
  "rule" | "entity" | "entityHasRoute" | "expression" | "file"
>;

const REGISTRY = "features/scopes/registry/entityRegistry.ts";

/**
 * Is `entity` a real registry token, or the detector saying "I could not name
 * this"? `(file)` marks a file-level finding and a `?`-prefix marks an
 * unresolved object root. Telling someone to add an `hrefFor` for a token
 * literally named `(file)` is worse than saying nothing — it sends an agent to
 * edit the registry for a thing that does not exist.
 */
export function isRegistryToken(entity: string): boolean {
  return entity !== "(file)" && !entity.startsWith("?");
}

export function describeFinding(f: DescribableFinding): string {
  switch (f.rule) {
    case "bare-id-text":
      return (
        `Renders the raw identifier \`${f.expression}\` as text with no way to open it. ` +
        (f.entityHasRoute
          ? `\`${f.entity}\` has a route in the entity registry — render <EntityRef token="${f.entity}" id={…} name={…} /> instead.`
          : isRegistryToken(f.entity)
            ? `Resolve it to a name plus a door, or don't show it. If \`${f.entity}\` should be openable, give its token an hrefFor in ${REGISTRY}.`
            : `The detector could not name this entity — identify which record it is, then resolve it to a name plus a door via <EntityRef>, or don't show it.`)
      );
    case "unlinked-entity-name":
      return (
        `Names a \`${f.entity}\` record (\`${f.expression}\`) as plain text while its id is in scope in this file — ` +
        (f.entityHasRoute
          ? `the registry already has a route for \`${f.entity}\`. Replace with <EntityRef token="${f.entity}" id={…} name={${f.expression}} /> (Open + new tab + peek, free).`
          : isRegistryToken(f.entity)
            ? `\`${f.entity}\` has no hrefFor yet. Add one in ${REGISTRY}, then render <EntityRef token="${f.entity}" … /> — fix the registry, not the call site.`
            // Unreachable from the scanner today (the name rule requires a
            // resolved token), but describeFinding is public and the invariant
            // is not visible from here — never emit "register `(file)`".
            : `The detector could not name this entity — identify which record it is, then render it through <EntityRef>.`)
      );
    case "unlinked-count":
      return (
        `"${f.expression}" counts records the user cannot reach. A count is a door — ` +
        `link it to the filtered list, open the peek, or drop the number.`
      );
    case "no-doors-in-file":
      return (
        `This surface reads records and names them, but imports no door primitive ` +
        `(no next/link, no EntityRef, no router, no overlay opener). Run the inventory pass: ` +
        `getEntityInfo(token).hrefFor, the peek registry, the entity's action registry — ` +
        `then consume them via <EntityRef>.`
      );
    default:
      return exhaustive(f.rule);
  }
}

function exhaustive(rule: never): never {
  throw new Error(`[dead-ends] no message for rule ${String(rule)}`);
}

/** Stable, human-facing rule label used by the CLI and the dashboard alike. */
export function ruleAnchor(rule: DeadEndRuleId): string {
  return `scripts/dead-ends/FEATURE.md#${rule}`;
}
