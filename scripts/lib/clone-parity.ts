/**
 * clone-parity.ts — THE CLONE IS THE MIRROR, AND THIS IS WHERE THAT IS CHECKED.
 *
 * 🚨 CHAIR RULING 2026-09-22 (lane CLONE-CATCHUP). The nightly dev clone is a MIRROR of
 * production. Lanes may rehearse on it only because rule 27's third leg puts back what the
 * inverse took away — so **a rehearsal that leaves a function body moved is the defect**, not
 * the nightly catch-up that then cannot carry production's next file over it.
 *
 * Both halves of that ruling need the same two facts — what a body hashes to on the clone, and
 * what it hashes to on production — so they live here once:
 *
 *   · `pnpm db:rehearse … --target clone` asserts parity AFTER leg 3 and exits non-zero naming
 *     every body that still differs, so a lane cannot walk away from a moved clone;
 *   · `scripts/night/clone-catchup.sh` re-establishes parity before it gives up on a DD-220
 *     `-- based-on:` refusal, by re-applying production's own ledgered bytes of the file that
 *     owns the drifted body.
 *
 * THE PRODUCTION CONNECTION IS READ-ONLY AND PROVES IT. `openProductionReadOnly` asks the server
 * to refuse a write in the exact transaction shape every read here uses (`begin read only`) and
 * refuses to hand back a client until it has. A session-level `default_transaction_read_only` is
 * NOT a proof on this estate: Supavisor in transaction mode silently drops it (measured
 * 2026-09-22 — `show default_transaction_read_only` answered `off` on a connection handed that
 * option). It also refuses a connection whose project ref is not production's, read from the
 * connection itself, because production and the clone are indistinguishable by system identifier.
 */

import type pg from "pg";
import { connectDirect, loadDbEnv, type DbEnv } from "./direct-db";
import {
  findReplaceOccurrences,
  liveOverloads,
  parseBasedOnLines,
  type Query,
} from "../migration-based-on";

/** One function body that is not the same on the two databases. */
export interface ParityDrift {
  /** `schema.name(identity args)` — what `-- based-on:` and `pnpm db:based-on` print. */
  readonly signature: string;
  readonly onClone: string | null;
  readonly onProduction: string | null;
  readonly why: string;
}

/**
 * Every function whose BODY a file writes: the `-- based-on:` lines (which exist precisely
 * because the file replaces a live body) plus every `create or replace function` it issues,
 * including the ones assembled at run time, since `findReplaceOccurrences` reads those too.
 */
export function functionsTouched(sql: string): string[] {
  const names = new Set<string>();
  for (const r of findReplaceOccurrences(sql)) if (r.name) names.add(r.name);
  for (const l of parseBasedOnLines(sql).lines) {
    const bare = l.signature.replace(/\(.*$/, "").trim();
    if (bare) names.add(bare);
  }
  return [...names].sort();
}

/** `begin read only; … ; commit` — the shape the refusal was proven against. */
export function readOnlyQuery(client: pg.Client): Query {
  return async (sql: string, params?: unknown[]) => {
    await client.query("begin read only");
    try {
      const r = await client.query(sql, params as never);
      await client.query("commit");
      return r.rows as Record<string, unknown>[];
    } catch (err) {
      await client.query("rollback").catch(() => undefined);
      throw err;
    }
  };
}

export interface ProductionReader {
  readonly client: pg.Client;
  readonly q: Query;
  readonly env: DbEnv;
}

/**
 * Open production for READING ONLY, and prove it before returning. `expectRef` is production's
 * project ref (BRANCH-REF's `parent_ref`); the ref is read back from the CONNECTION, never from
 * the server, because a data clone answers with production's own system identifier.
 */
export async function openProductionReadOnly(expectRef: string): Promise<ProductionReader> {
  const env = loadDbEnv();
  if ("missing" in env) {
    throw new Error(
      `the parity check needs the five SUPABASE_MATRIX_* values to READ production and they are ` +
        `not set (${env.missing.join(", ")}; looked in ${env.looked.join(", ")}). A parity ` +
        `assertion that cannot read production is a refusal, never a pass.`,
    );
  }
  const ref = env.user.includes(".")
    ? env.user.slice(env.user.indexOf(".") + 1)
    : /^db\.([^.]+)\./.exec(env.host)?.[1] ?? "";
  if (ref !== expectRef) {
    throw new Error(
      `the parity check intends PRODUCTION and the connection's project ref is ` +
        `${ref || "(none in the connection)"}, not ${expectRef}. A target is (system identifier, ` +
        `project ref) together — the number alone cannot tell a data clone from its parent.`,
    );
  }
  const client = await connectDirect(env, "clone-parity (production, read-only)");
  let refused = false;
  try {
    await client.query("begin read only");
    await client.query(`create table public.clone_parity_readonly_probe_${process.pid} (i int)`);
  } catch (err) {
    refused = /read-only transaction/i.test(String((err as Error)?.message ?? err));
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
  if (!refused) {
    await client.end().catch(() => undefined);
    throw new Error(
      `the server did not refuse a write in the transaction shape this check reads production ` +
        `with. A read-only claim the database does not enforce is a promise, and a promise is ` +
        `not a proof.`,
    );
  }
  return { client, q: readOnlyQuery(client), env };
}

/** Every overload's `pg_get_functiondef` hash for one name, keyed by its full signature. */
async function overloadHashes(q: Query, name: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const o of await liveOverloads(q, name)) out.set(o.signature, o.hash);
  return out;
}

/**
 * Compare every named function body on the clone against production.
 *
 * A function that exists on the CLONE and not on production is not drift — it is a new function
 * a rehearsal has not yet carried anywhere — and a function that exists on PRODUCTION and not on
 * the clone IS drift, because the clone is meant to hold production's world.
 */
export async function parityDrift(
  cloneQ: Query,
  prodQ: Query,
  names: readonly string[],
): Promise<ParityDrift[]> {
  const drift: ParityDrift[] = [];
  for (const name of names) {
    const [onClone, onProd] = await Promise.all([
      overloadHashes(cloneQ, name),
      overloadHashes(prodQ, name),
    ]);
    for (const [signature, prodHash] of onProd) {
      const cloneHash = onClone.get(signature) ?? null;
      if (cloneHash === prodHash) continue;
      drift.push({
        signature,
        onClone: cloneHash,
        onProduction: prodHash,
        why:
          cloneHash === null
            ? "production has this overload and the clone does not"
            : "the body on the clone is not the body on production",
      });
    }
  }
  return drift;
}
