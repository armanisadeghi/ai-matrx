/**
 * direct-from-schema — the gap the requirements call out: validate EVERY direct
 * supabase `.from()/.table()` against the LIVE snapshot, not a hand-maintained list.
 *
 * Three cases:
 *   • `.schema("S").from("X")` — if (S,X) is not a live table/view but X lives in
 *     another schema, it's a wrong-schema/moved bug. HIGH signal, near-zero noise.
 *   • bare `.from("X")` on the canonical public client (or a local alias/cast of
 *     it — `const db = supabase as any`) — resolves to public; if X now lives in
 *     another schema, that 404s at runtime (the reorg's classic break).
 *   • `.from("X")` through a canonical schema-binder helper (`docprocDb(supabase)`,
 *     or a local alias of one) — validated against THAT helper's bound schema,
 *     same as an explicit `.schema()` call. Binders are auto-discovered from
 *     `utils/supabase/*.ts` (see ../schema-binders.ts) so a wrong table through
 *     the wrong binder is no longer invisible.
 *
 * `X` may also be a local `const TABLE = "the_name"` string constant — resolved
 * per-file before matching (see ../table-ref-resolution.ts), since `.from(TABLE)`
 * is common and a bare regex on string literals alone would miss it. This is
 * exactly how the page_extraction_jobs PGRST205 in
 * docs/db_changes/canonicalization_worklog.md hid from every prior pass:
 * variable table name + `db = supabase as any` receiver, neither of which the
 * old literal-only / known-receiver-only checker could see through.
 *
 * Still conservative: an unresolved receiver (unknown function call, destructured
 * param, etc.) or an unresolved table-name variable is skipped, not flagged — no
 * false positives. Relations registered in dead-relations.json are deferred to
 * that check (which shares this same chain-schema resolution — see ../chain-schema.ts —
 * so a fix recognized here is recognized there too).
 *
 * Escape hatch: a `// schema-check-ignore` comment on the line silences it.
 */
import { isIgnored, loc, registerCheck } from "../context";
import { relationExists } from "../snapshot";
import { buildTableConsts, resolveFromCalls } from "../table-ref-resolution";
import { buildClientSchemas, resolvedChainSchema } from "../chain-schema";
import type { Context, Finding } from "../types";

// JS built-ins with a `.from(` that is not a supabase call.
const NOT_SUPABASE = /\b(Array|Object|Buffer|Date|(?:Ui|I)nt(?:8|16|32)Array|Uint8ClampedArray|Float(?:32|64)Array|BigInt64Array|BigUint64Array)$/;

function check(ctx: Context): Finding[] {
  const { snapshot: snap, schemaBinders } = ctx;
  if (snap.provenance === "none" || snap.tables.size === 0) return [];
  const findings: Finding[] = [];

  for (const file of ctx.codeFiles) {
    if (file.ext === ".sql") continue; // SQL handled by qualified-refs
    const { lines } = file;
    const content = lines.join("\n");
    const tableConsts = buildTableConsts(content);
    const clientSchemas = buildClientSchemas(content, schemaBinders);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (isIgnored(text)) continue;
      for (const { index, rel } of resolveFromCalls(text, tableConsts)) {
        if (NOT_SUPABASE.test(text.slice(0, index))) continue;
        if (ctx.deadOldNames.has(rel)) continue; // dead-relations owns it

        const { schema } = resolvedChainSchema(lines, i, schemaBinders, clientSchemas);
        const livesIn = [...(snap.relationSchemas.get(rel) ?? [])].sort();

        if (schema === null) continue; // unresolved receiver — ambiguous, skip (no false positives)

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

        // schema === "" → resolved to the public client (directly or via a bare alias/cast of it).
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
