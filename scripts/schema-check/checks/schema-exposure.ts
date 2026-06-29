/**
 * schema-exposure — every schema the client reads via `.schema("S")` must be
 * (a) live, (b) PostgREST-exposed (pgrst.db_schemas), and (c) in the
 * `pnpm db-types --schema` list so its Database types are generated.
 *
 * A `.schema("iam")` call against an unexposed schema 404s with no build error —
 * exactly the silent class the 2026 reorg introduced. This catches it offline.
 */
import { loc, registerCheck } from "../context";
import type { Context, Finding } from "../types";

const SCHEMA_RE = /\.schema\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g;

function check(ctx: Context): Finding[] {
  const { snapshot: snap } = ctx;
  if (snap.provenance === "none") return [];
  const live = new Set([...snap.tables.keys(), ...snap.views.keys()]);

  // schema -> first "path:line" it's referenced at.
  const referenced = new Map<string, string>();
  for (const file of ctx.codeFiles) {
    file.lines.forEach((text, i) => {
      SCHEMA_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = SCHEMA_RE.exec(text))) {
        if (!referenced.has(m[1])) referenced.set(m[1], loc(file, i));
      }
    });
  }

  const findings: Finding[] = [];
  for (const [schema, where] of [...referenced].sort()) {
    if (!live.has(schema)) {
      findings.push({
        check: "schema-exposure",
        severity: "error",
        message: `.schema("${schema}") — schema "${schema}" does not exist in the live DB (dropped/renamed?).`,
        location: where,
        fix: `Repoint to the real schema, or refresh the snapshot (pnpm check:schema:refresh) if it was just created.`,
      });
      continue;
    }
    if (snap.exposedSchemas.size && !snap.exposedSchemas.has(schema)) {
      findings.push({
        check: "schema-exposure",
        severity: "error",
        message: `.schema("${schema}") — schema "${schema}" is NOT PostgREST-exposed (pgrst.db_schemas). Client reads 404 at runtime.`,
        location: where,
        fix: `Expose it: ALTER ROLE authenticator SET pgrst.db_schemas = '…, ${schema}'; (then NOTIFY pgrst, 'reload config').`,
      });
      continue;
    }
    if (ctx.dbTypesSchemas.size && !ctx.dbTypesSchemas.has(schema)) {
      findings.push({
        check: "schema-exposure",
        severity: "error",
        message: `.schema("${schema}") — schema "${schema}" is missing from the \`pnpm db-types --schema\` list, so its Database types are never generated (TS can't type these reads).`,
        location: where,
        fix: `Add \`--schema ${schema}\` to the db-types script in package.json, then run pnpm db-types.`,
      });
    }
  }
  return findings;
}

registerCheck("schema-exposure", check);
