/**
 * CLOSE THE ROW FIRST, THEN REVOKE — the order a client door is taken back in.
 *
 * THE DEFECT THIS CLOSES (lane STORE-TXN-3, measured on the MAIN database 2026-09-22).
 * `platform.client_callable_door` is the register of which functions a client may call, and
 * `platform.reopen_declared_doors` — the `platform_reopen_declared_doors` event trigger, which
 * fires at the end of every REVOKE — hands EXECUTE straight back to any function whose register
 * row still says `signed_in_callers`. That is correct: a blanket revoke must not take declared
 * doors with it. But it means a lane that takes a door back in the wrong order —
 * `revoke execute … from authenticated` first, close the register row second — gets its revoke
 * silently undone in the same statement, and then closes the row. The grant is present and the
 * register says closed: the two disagree on the live database, which is exactly the state both
 * exist to prevent. STORE-TXN-3 did this to `custom.migrate_purge_hard` and only noticed by
 * reading the grant afterwards.
 *
 * THE RULE, JUDGED BY MEASUREMENT AND NOT BY THE FILE'S WORDING. After the file's bytes have
 * run and BEFORE the transaction commits, every function the file names in a
 * `revoke … on function <sig> from <client role>` is looked up again:
 *   · its register row still OPENS the lane that REVOKE names (signed_in_callers for
 *     authenticated/public, anonymous_callers for anon/public) → the revoke was undone by
 *     design: REFUSED;
 *   · its row is closed but the role STILL holds EXECUTE → it was revoked while the row was
 *     open, put back, and the row closed afterwards: REFUSED.
 * Either way the whole transaction rolls back and the sentence says what to do: close the row
 * first. Reading the end state rather than the order of statements means a file that closes the
 * row and THEN revokes, in one transaction, passes — which is the right order — and a file that
 * does the two in the wrong order cannot, however it is spelled.
 *
 * A blanket `revoke … on all functions in schema` is deliberately NOT judged: that is posture
 * restoration, and putting the declared doors back is what reopen_declared_doors is FOR.
 */
import { stripCommentsQuoteAware } from "./lib/migration-target";

export type RevokeQuery = (sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface RevokedFunction {
  /** The signature exactly as the file wrote it, e.g. `custom.migrate_purge_hard(uuid, text)`. */
  readonly signature: string;
  /** The client roles the REVOKE names, lower-cased: authenticated | anon | public. */
  readonly roles: readonly string[];
}

const CLIENT_ROLES = new Set(["authenticated", "anon", "public"]);
const SIGNATURE = /^[A-Za-z_"][\w."$]*\s*\([^()]*\)$/;

/** Every targeted `revoke … on function|procedure <sig> from <roles>` naming a client role. */
export function revokedClientFunctions(sql: string): RevokedFunction[] {
  const text = blankStrings(stripCommentsQuoteAware(sql));
  const out: RevokedFunction[] = [];
  const re =
    /\brevoke\s+(?:grant\s+option\s+for\s+)?(?:all(?:\s+privileges)?|execute)\s+on\s+(?:function|procedure|routine)\s+([\s\S]+?)\s+from\s+([\s\S]+?)(?:\s+(?:cascade|restrict|granted\s+by\b[^;]*))?\s*;/gi;
  for (const m of text.matchAll(re)) {
    const roles = m[2]!
      .split(",")
      .map((r) => r.trim().replace(/^"|"$/g, "").toLowerCase())
      .filter((r) => CLIENT_ROLES.has(r));
    if (!roles.length) continue;
    // One REVOKE may name several functions: `on function a(uuid), b(text)`.
    for (const sig of splitTopLevel(m[1]!)) {
      const s = sig.trim();
      // Only a real, literal signature. `%s` from a format() string inside a function body is
      // dynamic SQL this file does not run by itself, and handing it to to_regprocedure would
      // be asking the catalogue about a placeholder.
      if (SIGNATURE.test(s)) out.push({ signature: s, roles });
    }
  }
  return out;
}

export interface RevokeOrderFinding {
  readonly signature: string;
  readonly message: string;
}

/**
 * Run INSIDE the apply's transaction, after the file and before COMMIT. Returns one finding per
 * function whose register row and grant disagree with what the file's REVOKE meant.
 */
export async function revokeOrderFindings(q: RevokeQuery, sql: string): Promise<RevokeOrderFinding[]> {
  const findings: RevokeOrderFinding[] = [];
  for (const fn of revokedClientFunctions(sql)) {
    const rows = await q(
      `select p.oid::regprocedure::text as sig,
              d.id is not null                              as declared,
              coalesce(d.signed_in_callers, false)          as signed_in,
              coalesce(d.anonymous_callers, false)          as anonymous,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as grant_authenticated,
              has_function_privilege('anon', p.oid, 'EXECUTE')          as grant_anon
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         left join platform.client_callable_door d
           on d.schema_name = n.nspname and d.function_name = p.proname
          and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
        where p.oid = to_regprocedure($1)`,
      [fn.signature],
    );
    const r = rows[0];
    if (!r) continue; // dropped or never existed in this file's end state: nothing to disagree
    const sig = String(r.sig);
    for (const role of fn.roles) {
      const openForRole =
        role === "anon" ? r.anonymous === true
        : role === "authenticated" ? r.signed_in === true
        : r.signed_in === true || r.anonymous === true; // public covers both
      const grantHeld =
        role === "anon" ? r.grant_anon === true
        : role === "authenticated" ? r.grant_authenticated === true
        : r.grant_authenticated === true || r.grant_anon === true;
      if (openForRole) {
        findings.push({
          signature: sig,
          message:
            `revokes EXECUTE on ${sig} from ${role}, and that function's platform.client_callable_door ` +
            `row still OPENS the ${role === "anon" ? "anonymous" : "signed-in"} lane — so ` +
            `platform.reopen_declared_doors put the grant straight back in the same statement and ` +
            `this REVOKE did nothing. Close the row first (non_client_lane with its reason, ` +
            `signed_in_callers/anonymous_callers false), then revoke.`,
        });
      } else if (grantHeld && r.declared === true) {
        findings.push({
          signature: sig,
          message:
            `revokes EXECUTE on ${sig} from ${role}, and at the end of this file ${role} STILL holds ` +
            `it while the door's register row is closed — the REVOKE ran while the row was open, ` +
            `platform.reopen_declared_doors put the grant back, and the row was closed afterwards, ` +
            `so the grant and the register now disagree. Close the row first, then revoke.`,
        });
      }
    }
  }
  return findings;
}

/** Thrown inside the apply's transaction so it rolls back through the ordinary failure path. */
export class RevokeOrderRefusal extends Error {
  constructor(readonly filename: string, readonly findings: readonly RevokeOrderFinding[]) {
    super(
      `${filename} — ${findings.length} REVOKE(s) that the door register undoes or contradicts. ` +
        `Nothing was applied, no ledger row was written.\n` +
        findings.map((f) => `  - ${f.message}`).join("\n") +
        `\n  Law: close the row first, then revoke (common-docs/systems/platform/db-rules/FEATURE.md §6d; ` +
        `STORE-TXN-3, 2026-09-22).`,
    );
    this.name = "RevokeOrderRefusal";
  }
}

// ── small, local parsing helpers ────────────────────────────────────────────────────────

/** Replace the CONTENT of '…' literals with spaces so a sentence can never read as a REVOKE. */
function blankStrings(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const tag = /^\$([A-Za-z_]\w*)?\$/.exec(sql.slice(i));
    if (tag) {
      // A dollar-quoted body is CODE (a DO block, a function body): a REVOKE inside it is
      // dynamic and runs only when that code runs. Keep it — a body that revokes a door's
      // grant still leaves the same end state for the check to read.
      const close = sql.indexOf(tag[0], i + tag[0].length);
      const end = close < 0 ? sql.length : close + tag[0].length;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          break;
        }
        j += 1;
      }
      out += "'" + " ".repeat(Math.max(0, Math.min(j, sql.length) - i - 1)) + (j < sql.length ? "'" : "");
      i = j + 1;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** Split `a(uuid, text), b(int)` on the commas that are not inside parentheses. */
function splitTopLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}
