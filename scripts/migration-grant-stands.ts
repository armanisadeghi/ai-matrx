/**
 * A GRANT THAT DID NOT STAND IS A FAILED APPLY — the runner reads the end state, not the file.
 *
 * THE DEFECT THIS CLOSES (lane GRANT-GUARD). A migration that ends in a bare
 * `grant execute on function <sig> to authenticated` on a SECURITY DEFINER function with no
 * `platform.client_callable_door` row is silently undone by the database's DDL guard
 * (`platform.enforce_definer_client_grants`) in the very same statement: the apply "succeeds", the
 * ledger records it, and the function stays postgres-only. `notionsmall4_b_the_calendar_reads_the_
 * organizations_week.sql` left `custom.agg_calendar` answering 403 to every signed-in person until
 * `make_viewdup_b_the_calendar_door_is_declared.sql` declared its door.
 *
 * THE RULE, JUDGED BY MEASUREMENT. After the file's bytes have run and BEFORE the transaction
 * commits, every function the file names in a `grant execute|all on function <sig> to <role>` for
 * `authenticated` or `anon` is looked up again with has_function_privilege. A role that does not hold
 * EXECUTE means the grant did not stand: the whole transaction rolls back and the message names the
 * function and the fix. A file that also REVOKEs that role on that function is not judged (its end
 * state is meant to be closed). A blanket `on all functions in schema` is not judged; `public` is not
 * judged (Postgres grants PUBLIC execute by default, so it can never fail this way).
 */
import { stripCommentsQuoteAware } from "./lib/migration-target";
import { blankStrings, splitTopLevel, revokedClientFunctions } from "./migration-revoke-order";

export type GrantQuery = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface GrantedFunction {
  readonly signature: string;
  readonly roles: readonly ("authenticated" | "anon")[];
}

const SIGNATURE = /^[A-Za-z_"][\w."$]*\s*\([^()]*\)$/;

/** Every targeted `grant execute|all on function|procedure <sig> to <roles>` naming authenticated/anon. */
export function grantedClientFunctions(sql: string): GrantedFunction[] {
  const text = blankStrings(stripCommentsQuoteAware(sql));
  const out: GrantedFunction[] = [];
  const re =
    /\bgrant\s+(?:all(?:\s+privileges)?|execute)\s+on\s+(?:function|procedure|routine)\s+([\s\S]+?)\s+to\s+([\s\S]+?)(?:\s+with\s+grant\s+option|\s+granted\s+by\b[^;]*)?\s*;/gi;
  for (const m of text.matchAll(re)) {
    const roles = m[2]!
      .split(",")
      .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())
      .filter((r): r is "authenticated" | "anon" => r === "authenticated" || r === "anon");
    if (!roles.length) continue;
    for (const sig of splitTopLevel(m[1]!)) {
      const s = sig.trim();
      if (SIGNATURE.test(s)) out.push({ signature: s, roles });
    }
  }
  return out;
}

export interface GrantStandsFinding {
  readonly signature: string;
  readonly role: string;
  readonly message: string;
}

function parseSignature(sig: string): { schema: string | null; name: string; nargs: number } | null {
  const i = sig.indexOf("(");
  if (i < 0) return null;
  const parts = sig.slice(0, i).trim().split(".").map((x) => x.trim().replace(/^"|"$/g, ""));
  const name = parts.pop()!;
  const schema = parts.length ? parts[parts.length - 1]! : null;
  const inner = sig.slice(i + 1, sig.lastIndexOf(")")).trim();
  const args = inner ? splitTopLevel(inner).filter((a) => !/^\s*out\s/i.test(a)) : [];
  return { schema, name, nargs: args.length };
}

/** Run INSIDE the apply's transaction, after the file and before COMMIT. */
export async function grantStandsFindings(q: GrantQuery, sql: string): Promise<GrantStandsFinding[]> {
  const findings: GrantStandsFinding[] = [];
  const revoked = new Map<string, Set<string>>();
  for (const r of revokedClientFunctions(sql)) {
    const k = r.signature.replace(/\s+/g, "").toLowerCase();
    const set = revoked.get(k) ?? new Set<string>();
    for (const role of r.roles) set.add(role);
    revoked.set(k, set);
  }
  for (const fn of grantedClientFunctions(sql)) {
    // A GRANT signature may carry argument NAMES (`f(p_id uuid)`), which to_regprocedure rejects with
    // a syntax error that would abort the transaction. Resolve by schema, name and argument count
    // instead; when overloads share the count, only a grant held by NONE of them is a failure.
    const parsed = parseSignature(fn.signature);
    if (!parsed) continue;
    const rows = await q(
      `select p.oid::regprocedure::text as sig,
              p.prosecdef as definer,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as g_auth,
              has_function_privilege('anon', p.oid, 'EXECUTE')          as g_anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname = $2 and p.pronargs = $3
          and (($1::text is not null and n.nspname = $1) or ($1::text is null and n.nspname = any (current_schemas(true))))`,
      [parsed.schema, parsed.name, parsed.nargs],
    );
    if (!rows.length) continue; // dropped in this file's end state
    const r = { ...rows[0]!, g_auth: rows.some((x) => x.g_auth === true), g_anon: rows.some((x) => x.g_anon === true) };
    const k = fn.signature.replace(/\s+/g, "").toLowerCase();
    for (const role of fn.roles) {
      if (revoked.get(k)?.has(role) || revoked.get(k)?.has("public")) continue;
      const held = role === "anon" ? r.g_anon === true : r.g_auth === true;
      if (held) continue;
      const sig = String(r.sig);
      findings.push({
        signature: sig,
        role,
        message:
          `grants EXECUTE on ${sig} to ${role}, but at the end of this file ${role} does NOT hold it` +
          (r.definer === true
            ? ` — it is SECURITY DEFINER with no platform.client_callable_door row, so the database's DDL guard stripped the grant in the same statement.` +
              ` Declare its client_callable_door row (before the GRANT), then run reopen_declared_doors().`
            : ` — something took the grant back in the same transaction; read platform.ddl_guard_log.`),
      });
    }
  }
  return findings;
}

/** Thrown inside the apply's transaction so it rolls back through the ordinary failure path. */
export class GrantStandsRefusal extends Error {
  constructor(readonly filename: string, readonly findings: readonly GrantStandsFinding[]) {
    super(
      `${filename} — ${findings.length} GRANT(s) that did not stand. Nothing was applied, no ledger row was written.\n` +
        findings.map((f) => `  - ${f.message}`).join("\n") +
        `\n  Law: a client-callable SECURITY DEFINER function needs its door row first (database FEATURE.md §6d-4).`,
    );
    this.name = "GrantStandsRefusal";
  }
}
