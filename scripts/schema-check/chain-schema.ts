/**
 * Shared "what schema does this `.from()`/`.table()` call chain actually resolve
 * to" resolution — used by both `direct-from-schema` (does X live there?) and
 * `dead-relations` (has this call already been repointed to the new schema?).
 *
 * Without this shared once, the two checks could disagree: teaching one about a
 * client alias or a canonical `<name>Db(client)` binder (see ./schema-binders.ts)
 * without teaching the other means a correctly-fixed call site (e.g.
 * `const db = docprocDb(supabase); db.from("x")`) reads as "still wrong" to
 * whichever check didn't get the memo — a false positive, not a missed bug, but
 * exactly the kind of noise that makes people stop trusting the checker.
 */

const SCHEMA_RE = /\.schema\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g;
// Receivers we KNOW default to the public schema (raw supabase client handles).
export const PUBLIC_CLIENTS = new Set(["supabase", "supabaseClient", "sb"]);

// `const db = supabase as any;` / `const db = supabase;` — a bare alias of the public client (no `.schema()` in the RHS).
const PUBLIC_ALIAS_RE = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:supabase|supabaseClient|sb)\s*(?:as\s+any)?\s*[;,]/g;
// `const docproc = (supabase as any).schema("docproc");` — an alias pre-bound to a schema.
const SCHEMA_ALIAS_RE = /(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=[^;]*\.schema\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)\s*;/g;
// `const db = docprocDb(supabase);` — an alias of a canonical schema-binder call.
function binderAliasRe(binderNames: string[]): RegExp {
  const alt = binderNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(?:${alt})\\(`, "g");
}

/** Per-file client-alias -> schema lookup ("" = a bare alias of the public client). */
export function buildClientSchemas(content: string, binders: Map<string, string>): Map<string, string> {
  const clientSchemas = new Map<string, string>();
  for (const m of content.matchAll(PUBLIC_ALIAS_RE)) clientSchemas.set(m[1], "");
  for (const m of content.matchAll(SCHEMA_ALIAS_RE)) clientSchemas.set(m[1], m[2]);
  if (binders.size > 0) {
    for (const m of content.matchAll(binderAliasRe([...binders.keys()]))) {
      const binderName = m[0].match(/=\s*(\w+)\(/)?.[1];
      if (binderName && binders.has(binderName)) clientSchemas.set(m[1], binders.get(binderName)!);
    }
  }
  return clientSchemas;
}

/** Walks up from line `i` while preceding lines are chained (`.foo(...)`), to the chain's start. */
export function chainStartOf(lines: string[], i: number): number {
  let chainStart = i;
  while (chainStart > 0 && lines[chainStart].trim().startsWith(".")) chainStart--;
  return chainStart;
}

/** The last explicit `.schema("S")` in the method chain from `chainStart` through line `i`, or null. */
export function explicitChainSchema(lines: string[], chainStart: number, i: number): string | null {
  const chain = lines.slice(chainStart, i + 1).join("\n");
  let last: string | null = null;
  for (const m of chain.matchAll(SCHEMA_RE)) last = m[1];
  return last;
}

/**
 * Leading receiver of a chain: a plain `<ident>.` member access, or a call
 * `<ident>(...)`. Also matches a BARE trailing identifier with nothing after it
 * (`const { data } = await db` with `.from(...)` starting the NEXT line) — since
 * `chainRoot` is only ever called on the head line of a chain that `chainStartOf`
 * already confirmed continues via a following `.`-prefixed line, a trailing bare
 * identifier here unambiguously means "member access continues on the next line".
 */
export function chainRoot(lines: string[], chainStart: number): { ident: string; isCall: boolean } | null {
  const root = lines[chainStart]
    .replace(/^\s*(?:export\s+)?(?:const|let|var)\s+[\w{}\[\],\s:]+=\s*/, "")
    .replace(/^\s*void\s+/, "") // `void docprocDb(supabase)` — discarded-promise chain
    .replace(/^\s*(?:return|await|=>)\s*/g, "")
    .replace(/^\(\s*/, "") // strip a leading cast paren: "(supabase as any).from(...)"
    .trimStart();
  const m = root.match(/^([A-Za-z_$][\w$]*)\s*(?:([.(])|$)/);
  if (!m) return null;
  return { ident: m[1], isCall: m[2] === "(" };
}

/**
 * The effective schema a `.from()/.table()` call at line `i` resolves to:
 * explicit `.schema("S")` in the chain first, else a binder call/alias
 * (`docprocDb(supabase)` or `const db = docprocDb(supabase)`), else `""` for a
 * known public-client receiver/alias, else `null` (unresolved — ambiguous).
 */
export function resolvedChainSchema(
  lines: string[],
  i: number,
  binders: Map<string, string>,
  clientSchemas: Map<string, string>,
): { schema: string | null; chainStart: number } {
  const chainStart = chainStartOf(lines, i);
  const explicit = explicitChainSchema(lines, chainStart, i);
  if (explicit) return { schema: explicit, chainStart };

  const root = chainRoot(lines, chainStart);
  if (!root) return { schema: null, chainStart };
  if (root.isCall) return { schema: binders.get(root.ident) ?? null, chainStart }; // `docprocDb(supabase).from(...)`
  if (PUBLIC_CLIENTS.has(root.ident)) return { schema: "", chainStart };
  if (clientSchemas.has(root.ident)) return { schema: clientSchemas.get(root.ident)!, chainStart }; // aliased const, "" = public
  return { schema: null, chainStart };
}
