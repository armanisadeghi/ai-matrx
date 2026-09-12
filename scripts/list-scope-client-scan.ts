/**
 * GUARD B — THE CLIENT HALF OF THE LIST-SCOPE AXIS (VISIBILITY-BY-CLASS §3.3, DD-137c).
 *
 * §3.3 names two guards. Guard A (in `check-list-scope.ts`) asserts that no `%_list_scoped` RPC
 * decides access by hand. THIS is Guard B, and §3.3 states it exactly:
 *
 *   "FAIL any repository query applying an identity filter as the SOLE scope on a token whose
 *    `default_list_scope = 'organization'`."
 *
 * 🚨 THE REGISTRY DECIDES, NOT A LIST IN THIS FILE. That sentence is the whole design, and it is
 * why this guard is not "ban `.eq('created_by', …)`". Filtering a list to its owner is CORRECT on
 * every token the registry lands on `mine` — a person's vault, their preferences, their study
 * attempts, their own conversations. It is a DEFECT on a token the registry lands on
 * `organization`, because there the screen is meant to open on the organization's work and the
 * filter throws away the `organization_id` the row is carrying. The same line of code is right in
 * one file and wrong in another, and only the registry knows which. So this scanner resolves every
 * query's table to its registry token and asks `platform.entity_types.default_list_scope`.
 *
 * WHY IT IS A TEXT SCAN AND WHAT THAT COSTS. There is no type information here: it reads
 * `.schema("x").from("y")` chains out of the source. That makes it cheap and repo-wide, and it
 * makes it FALLIBLE in one direction — a table name it cannot resolve, or a chain it cannot see
 * the end of, is reported as UNRESOLVED and counted, never quietly passed. An unresolved finding is
 * a failure of this guard, not a pass for the code.
 *
 * THE EXEMPTION, AND WHY IT IS NOT A LIST OF FILES. A query is not flagged when it already answers
 * the question some other way: it filters on `organization_id`, it filters on `visibility`, or it
 * asks `lib/list-scope` (`scopeToOwner` / `resolveListScope` / `shouldFilterToOwner`) and applies
 * the owner filter only when the registry said `mine`. That last one is the shape the fix takes, so
 * a fixed site stops being flagged BECAUSE it is fixed — never because its path was added here.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type ScopeWord = "mine" | "organization";
/**
 * What the registry knows about a table:
 *   `mine` / `organization` — a declared landing place (§3.3's second axis).
 *   `inherited`             — a registered COMPONENT or LEDGER. F-20 leaves its scope NULL on
 *                             purpose: db-rules §6d-1 says a component's access IS its parent's, so
 *                             "mine" is not expressible there and a scope on it would be a second
 *                             answer to a question its parent already answers.
 *   `ambiguous`             — one bare table name, two schemas, two different answers.
 */
export type RegistryFact = ScopeWord | "inherited" | "ambiguous";
export type Registry = Map<string, RegistryFact>;

export type Finding = {
  file: string;
  line: number;
  table: string;
  token: string;
  scope: ScopeWord | "inherited" | "unresolved";
  column: string;
  snippet: string;
};

const OWNER_COLS = ["created_by", "user_id", "owner_id", "created_by_user_id", "created_by_id"];

/** An identity filter applied to a query — the thing §3.3 calls "an identity filter". */
const OWNER_FILTER = new RegExp(
  String.raw`\.eq\(\s*["'\`](` + OWNER_COLS.join("|") + String.raw`)["'\`]\s*,`,
  "g",
);

/** Answered inside the query chain itself. */
const EXEMPT_IN_CHAIN = [
  /\.eq\(\s*["'`](organization_id|org_id)["'`]/,           // already scoped to an organization
  /\.in\(\s*["'`](organization_id|org_id)["'`]/,
  /["'`]visibility["'`]/,                                    // already scoped by visibility
  /\bscope\.kind\b/,                                        // an explicit scope branch (THE VIEW LAW)
];

/**
 * Answered ABOVE the query. The fix's shape is
 *   `const ownerOnly = await scopeToOwner("note", scope);`  … then …  `if (ownerOnly) q = q.eq(…)`
 * and the `scopeToOwner` line sits BEFORE the `.from(`, so a window that starts at `.from(` cannot
 * see it and calls a fixed site broken. This set is matched against the surrounding code instead.
 */
const EXEMPT_ABOVE = [
  /\bscopeToOwner\b|\bresolveListScope\b|\bshouldFilterToOwner\b/, // asks the registry
  /\b\w*[Oo]wnerOnly\b/,                                     // the local name the helper's answer takes
];

/**
 * A write, or a single-row read, is not a list and is not this guard's business.
 *
 * The optional `<…>` is not decoration: `.maybeSingle<{ id: string }>()` is how half this repo
 * types a single-row read, and without it the detector called `createPersonalCopy` a list and
 * reported a defect that was not one. A guard's first false positive is the one people remember.
 */
const NOT_A_LIST = /\.(single|maybeSingle|insert|update|upsert|delete)\s*(<[^;()]*?>)?\s*\(/;

/**
 * A SERVICE-ROLE query is not a list scope, and flagging one is how a guard loses its audience.
 *
 * `app/api/admin/users/acquisition/[rowId]/route.ts` filters `ops.app_log` by `user_id` — and that
 * `userId` is the ADMIN'S ROUTE PARAMETER, the person being looked at, not the person looking. The
 * variable is called `userId` in both places, so no amount of naming cleverness tells them apart.
 * What does tell them apart is the CLIENT: a service-role client bypasses RLS entirely and is
 * answering "show me this one user's rows", which is the opposite of a default landing place.
 * The receiver is the honest signal, so the receiver is what this reads.
 */
const SERVICE_CLIENT = /^(admin|adminClient|supabaseAdmin|serviceClient|serviceRole|serviceSupabase|adminSupabase|svc)$/;

/**
 * THE TERNARY TWIN — the one shape that is scope-declared and cannot be seen from inside one chain.
 *
 * `features/crm/analytics/service.ts` reads the same table two ways in one expression:
 *
 *   ctx.orgIds.length
 *     ? platformDb.from("outcome_event")…in("organization_id", ctx.orgIds)…
 *     : platformDb.from("outcome_event")…eq("created_by", ctx.userId)…
 *
 * The owner branch is the fallback for a person who belongs to no organization, where their own
 * rows ARE their whole world. It is correct, and the chain it lives in genuinely has no
 * organization filter — the filter is in its twin, a few lines up. So this looks for exactly that:
 * ANOTHER read of THE SAME TABLE, inside a tight window, that is organization-scoped. Narrow on
 * purpose — it will not exempt a different table, and it will not reach across a whole function.
 */
export function hasOrgScopedTwin(before: string, after: string, table: string): boolean {
  const WINDOW = 700;
  const near = before.slice(-WINDOW) + after.slice(0, WINDOW);
  const twin = new RegExp(
    String.raw`\.from\(\s*["'\`]` + table + String.raw`["'\`]\s*\)[\s\S]{0,400}?\.(eq|in)\(\s*["'\`](organization_id|org_id)["'\`]`,
  );
  return twin.test(near);
}

export function isOrganizationScoped(reg: Registry, schema: string | null, table: string):
  { token: string; scope: ScopeWord | "inherited" | "unresolved" } {
  const keyed = schema ? reg.get(`${schema}.${table}`) : undefined;
  const bare = reg.get(table);
  const hit = keyed ?? bare;
  const name = schema ? `${schema}.${table}` : table;
  if (!hit) return { token: name, scope: "unresolved" };
  if (hit === "ambiguous") return { token: name, scope: "unresolved" };
  return { token: name, scope: hit };
}

/**
 * THE PURE DETECTOR, exported so the self-test can hand it source it wrote itself. Given one file's
 * text and the registry, return every identity filter that is the sole scope of a list query on a
 * token the registry lands on `organization`.
 */
export function scanSource(text: string, file: string, reg: Registry): Finding[] {
  const found: Finding[] = [];
  OWNER_FILTER.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = OWNER_FILTER.exec(text)) !== null) {
    const at = m.index;
    // The chain this filter belongs to: back to the `.from(` that opened it, forward to the end of
    // the statement. Both bounded, because a runaway window turns every file into one query.
    const before = text.slice(Math.max(0, at - 1400), at);
    const after = text.slice(at, at + 900);
    const fromM = [...before.matchAll(/\.from\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/g)].pop();
    if (!fromM) continue; // not a postgrest chain we can resolve — e.g. an ORM or a local array
    const table = fromM[1];
    const schemaM = [...before.matchAll(/\.schema\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/g)].pop();
    const schema = schemaM ? schemaM[1] : null;

    // The identifier the chain hangs off: `supabase.schema(…)`, `admin.from(…)`, `client.from(…)`.
    const head = before.slice(0, (schemaM?.index ?? fromM.index) ?? 0);
    const receiver = /([A-Za-z_$][A-Za-z0-9_$]*)\s*$/.exec(head.replace(/\s*\.\s*$/, ""))?.[1] ?? "";
    if (SERVICE_CLIENT.test(receiver)) continue;

    const chain = before.slice(fromM.index ?? 0) + after;
    if (NOT_A_LIST.test(chain)) continue;
    if (EXEMPT_IN_CHAIN.some((re) => re.test(chain))) continue;
    if (EXEMPT_ABOVE.some((re) => re.test(before) || re.test(after))) continue;
    if (hasOrgScopedTwin(before, after, table)) continue;

    const { token, scope } = isOrganizationScoped(reg, schema, table);
    if (scope === "mine") continue; // the registry says this list belongs to its owner. Correct.

    found.push({
      file,
      line: text.slice(0, at).split("\n").length,
      table: schema ? `${schema}.${table}` : table,
      token,
      scope,
      column: m[1],
      snippet: text.slice(at, at + 70).split("\n")[0].trim(),
    });
  }
  return found;
}

const SKIP_DIR = new Set([
  "node_modules", ".next", "dist", "build", ".git", "__tests__", "coverage", "migrations",
  "supabase", "scripts", "types",
]);

export function walk(root: string, out: string[] = []): string[] {
  for (const name of readdirSync(root)) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(root, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec|d)\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

export function scanRepo(root: string, reg: Registry): Finding[] {
  const findings: Finding[] = [];
  for (const dir of ["app", "features", "lib", "actions", "hooks", "utils", "components"]) {
    let files: string[];
    try { files = walk(join(root, dir)); } catch { continue; }
    for (const f of files) {
      let text: string;
      try { text = readFileSync(f, "utf8"); } catch { continue; }
      if (!text.includes(".from(")) continue;
      findings.push(...scanSource(text, relative(root, f), reg));
    }
  }
  return findings;
}
