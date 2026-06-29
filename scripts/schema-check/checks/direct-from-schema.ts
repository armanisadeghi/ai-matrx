/**
 * direct-from-schema — the gap the requirements call out: validate EVERY direct
 * supabase `.from()/.table()` against the LIVE snapshot, not a hand-maintained list.
 *
 * Two cases:
 *   • `.schema("S").from("X")` — if (S,X) is not a live table/view but X lives in
 *     another schema, it's a wrong-schema/moved bug. HIGH signal, near-zero noise.
 *   • bare `.from("X")` on the canonical public client — resolves to public; if X
 *     now lives in another schema, that 404s at runtime (the reorg's classic break).
 *
 * Conservative by construction (this runs on every commit): bare-from is only
 * judged when the receiver is the plain `supabase` client. Function-style schema
 * binders (`graveyardDb(supabase).from(...)`) and ambiguous receivers (`db`,
 * `client`, params) are treated as unknown and skipped — no false positives.
 * Relations registered in dead-relations.json are deferred to that check.
 *
 * Escape hatch: a `// schema-check-ignore` comment on the line silences it.
 */
import { isIgnored, loc, registerCheck } from "../context";
import { relationExists } from "../snapshot";
import type { Context, Finding } from "../types";

const FROM_RE = /\.(from|table)\(\s*(['"`])([A-Za-z_][A-Za-z0-9_]*)\2/g;
const SCHEMA_RE = /\.schema\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g;
// Receivers we KNOW default to the public schema (raw supabase client handles).
const PUBLIC_CLIENTS = new Set(["supabase", "supabaseClient", "sb"]);
// JS built-ins with a `.from(` that is not a supabase call.
const NOT_SUPABASE = /\b(Array|Object|Buffer|Date|(?:Ui|I)nt(?:8|16|32)Array|Uint8ClampedArray|Float(?:32|64)Array|BigInt64Array|BigUint64Array)$/;

/** The nearest `.schema("S")` in the method chain ending at line `i`, or null. */
function chainSchema(lines: string[], i: number): { schema: string | null; chainStart: number } {
  let chainStart = i;
  while (chainStart > 0 && lines[chainStart].trim().startsWith(".")) chainStart--;
  const chain = lines.slice(chainStart, i + 1).join("\n");
  let last: string | null = null;
  for (const m of chain.matchAll(SCHEMA_RE)) last = m[1];
  return { schema: last, chainStart };
}

/** Leading receiver identifier of a chain, when it's a plain `<ident>.` member access. */
function publicReceiver(lines: string[], chainStart: number): boolean {
  const root = lines[chainStart]
    .replace(/^\s*(?:export\s+)?(?:const|let|var)\s+[\w{}\[\],\s:]+=\s*/, "")
    .replace(/^\s*(?:return|await|=>)\s*/g, "")
    .trimStart();
  const m = root.match(/^([A-Za-z_$][\w$]*)\s*([.(])/);
  if (!m) return false;
  // `<ident>(` is a call expression (e.g. a schema binder) — not a known public client.
  return m[2] === "." && PUBLIC_CLIENTS.has(m[1]);
}

function check(ctx: Context): Finding[] {
  const { snapshot: snap } = ctx;
  if (snap.provenance === "none" || snap.tables.size === 0) return [];
  const findings: Finding[] = [];

  for (const file of ctx.codeFiles) {
    if (file.ext === ".sql") continue; // SQL handled by qualified-refs
    const { lines } = file;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (isIgnored(text)) continue;
      FROM_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = FROM_RE.exec(text))) {
        const rel = m[3];
        if (NOT_SUPABASE.test(text.slice(0, m.index))) continue;
        if (ctx.deadOldNames.has(rel)) continue; // dead-relations owns it

        const { schema, chainStart } = chainSchema(lines, i);
        const livesIn = [...(snap.relationSchemas.get(rel) ?? [])].sort();

        if (schema) {
          if (relationExists(snap, schema, rel)) continue;
          if (livesIn.length) {
            findings.push({
              check: "direct-from-schema",
              severity: "error",
              message: `.schema("${schema}").from("${rel}") — "${rel}" is not a live table/view in "${schema}"; it lives in ${livesIn.map((s) => `"${s}"`).join(", ")}.`,
              location: loc(file, i),
              fix: `Use .schema("${livesIn[0]}").from("${rel}").`,
            });
          } else if (ctx.warn) {
            findings.push({
              check: "direct-from-schema",
              severity: "warn",
              message: `.schema("${schema}").from("${rel}") — "${rel}" is not a known relation in any live schema (typo? dropped table? RPC?).`,
              location: loc(file, i),
            });
          }
          continue;
        }

        // No explicit schema in the chain → resolves to public, but only judge it
        // when we're sure the receiver is the plain public client.
        if (!publicReceiver(lines, chainStart)) continue;
        if (relationExists(snap, "public", rel)) continue;
        if (livesIn.length) {
          findings.push({
            check: "direct-from-schema",
            severity: "error",
            message: `bare .from("${rel}") resolves to public, but "${rel}" is not in public — it lives in ${livesIn.map((s) => `"${s}"`).join(", ")}. This 404s at runtime.`,
            location: loc(file, i),
            fix: `Add the schema: .schema("${livesIn[0]}").from("${rel}").`,
          });
        } else if (ctx.warn) {
          findings.push({
            check: "direct-from-schema",
            severity: "warn",
            message: `bare .from("${rel}") on the public client, but "${rel}" is not a live public table/view (typo? dropped? view added since the snapshot?).`,
            location: loc(file, i),
          });
        }
      }
    }
  }
  return findings;
}

registerCheck("direct-from-schema", check);
