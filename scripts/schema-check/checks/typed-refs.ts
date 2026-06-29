/**
 * typed-refs — `Database["S"]["Tables"]["X"]` references in SOURCE code that no
 * longer resolve to a live table. tsc catches these only while the generated
 * types are fresh; once a table moves schema this guard names the new home.
 *
 * (Generated files are excluded from the scan, so this only flags hand-written
 * type references. Relations in dead-relations.json are deferred to that check.)
 */
import { isIgnored, loc, registerCheck } from "../context";
import type { Context, Finding } from "../types";

const TYPED_RE =
  /Database\[\s*['"]([a-z_][a-z0-9_]*)['"]\s*\]\[\s*['"]Tables['"]\s*\]\[\s*['"]([A-Za-z_][A-Za-z0-9_]*)['"]/g;

function check(ctx: Context): Finding[] {
  const { snapshot: snap } = ctx;
  if (snap.provenance === "none" || snap.tables.size === 0) return [];
  const findings: Finding[] = [];

  const tableSchemas = (rel: string) =>
    [...snap.tables].filter(([, set]) => set.has(rel)).map(([s]) => s).sort();

  for (const file of ctx.codeFiles) {
    const { lines } = file;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (isIgnored(text)) continue;
      TYPED_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TYPED_RE.exec(text))) {
        const schema = m[1];
        const rel = m[2];
        if (ctx.deadOldNames.has(rel)) continue;
        if (snap.tables.get(schema)?.has(rel)) continue; // live table in S → OK

        const livesIn = tableSchemas(rel);
        if (livesIn.length) {
          findings.push({
            check: "typed-refs",
            severity: "error",
            message: `Database["${schema}"]["Tables"]["${rel}"] — "${rel}" is not a live table in "${schema}"; it lives in ${livesIn.map((s) => `"${s}"`).join(", ")}.`,
            location: loc(file, i),
            fix: `Use Database["${livesIn[0]}"]["Tables"]["${rel}"].`,
          });
        } else if (ctx.warn) {
          const asView = [...snap.views].some(([, set]) => set.has(rel));
          findings.push({
            check: "typed-refs",
            severity: "warn",
            message: `Database["${schema}"]["Tables"]["${rel}"] — "${rel}" is not a live table anywhere${asView ? " (it is a VIEW — use [\"Views\"])" : " (dropped? typo?)"}.`,
            location: loc(file, i),
          });
        }
      }
    }
  }
  return findings;
}

registerCheck("typed-refs", check);
