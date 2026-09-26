/**
 * clone-parity-judge.ts — the PURE half of the rehearsal parity gate (no database, no env), so
 * it can be tested on its own. The connected half is clone-parity.ts, which re-exports this.
 */
import { parseBasedOnLines } from "../migration-based-on";

/** One function body that is not the same on the two databases. */
export interface ParityDrift {
  /** `schema.name(identity args)` — what `-- based-on:` and `pnpm db:based-on` print. */
  readonly signature: string;
  readonly onClone: string | null;
  readonly onProduction: string | null;
  readonly why: string;
}

/**
 * The pure core of the gate: one function NAME, its overload hashes on each database, and the
 * hashes the file's own `-- based-on:` lines declare for that name.
 *
 * 🚨 BASED-ON, NOT PRODUCTION'S CURRENT BODY (lane DB-TOOLS-NO-BRANCH, 2026-09-25). Comparing the
 * clone with production's CURRENT body failed EVERY file that replaces a function body until that
 * file was on production: after leg 3 the clone rightly holds the NEW body, production the old one.
 * The rehearsal happens BEFORE the production apply, so the gate could never pass when it mattered.
 * What must hold instead: production still holds the body the file was WRITTEN AGAINST — its
 * `-- based-on:` hash — so the production apply will land on the state the rehearsal proved.
 *
 *   · clone == production                      → level (the file is on production, or untouched)
 *   · production == a based-on hash of the file → PENDING: not yet applied there; passes
 *   · anything else                            → drift, named. With a based-on line for the name it
 *                                                says the based-on drifted (re-read the body with
 *                                                `pnpm db:based-on` and rewrite the file).
 */
export function judgeParity(
  name: string,
  onClone: ReadonlyMap<string, string>,
  onProd: ReadonlyMap<string, string>,
  basedOnHashes: ReadonlySet<string>,
): { drift: ParityDrift[]; pending: string[] } {
  const drift: ParityDrift[] = [];
  const pending: string[] = [];
  const declaresName = basedOnHashes.size > 0;
  for (const [signature, prodHash] of onProd) {
    const cloneHash = onClone.get(signature) ?? null;
    if (cloneHash === prodHash) continue;
    if (basedOnHashes.has(prodHash)) {
      pending.push(signature);
      continue;
    }
    drift.push({
      signature,
      onClone: cloneHash,
      onProduction: prodHash,
      why: declaresName
        ? `production's body is neither the clone's nor the file's -- based-on body for ${name}: the based-on DRIFTED since the file was written`
        : cloneHash === null
          ? "production has this overload and the clone does not"
          : "the body on the clone is not the body on production",
    });
  }
  return { drift, pending };
}

/** Every `-- based-on:` FUNCTION hash a file declares, grouped by bare `schema.name`. */
export function basedOnHashesByName(sql: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const l of parseBasedOnLines(sql).lines) {
    if (l.kind !== "function") continue;
    const bare = l.signature.replace(/\(.*$/, "").trim().replace(/"/g, "").toLowerCase();
    if (!out.has(bare)) out.set(bare, new Set());
    out.get(bare)!.add(l.hash);
  }
  return out;
}

