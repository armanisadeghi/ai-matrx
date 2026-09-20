/**
 * qualified-refs — `schema.table` strings (raw SQL, RPC params, filter strings)
 * that point at a relation now living elsewhere, e.g. `public.organizations`
 * (now `iam.organizations`) or `public.notes` (now `workbench.notes`).
 *
 * Precision (mirrors the aidream backend so noise stays near zero):
 *   • `public.`/`graveyard.` prefixes are always treated as SQL (no JS module is
 *     named those), so they're judged on any line.
 *   • any other live-schema prefix is judged ONLY on a SQL-ish line (FROM/JOIN/
 *     INTO/UPDATE/TABLE/REFERENCES …) — avoids flagging JS member access.
 *   • a pair is flagged ONLY when the table genuinely lives in another schema —
 *     so functions and views (not in the table snapshot) never produce noise.
 * Relations in dead-relations.json are deferred to that check.
 */
import { isIgnored, loc, registerCheck } from "../context";
import { relationExists } from "../snapshot";
import type { Context, Finding } from "../types";
import ts from "typescript";

const PAIR_RE = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g;
const SQL_KEYWORD = /\b(from|join|into|update|table|references|truncate|delete\s+from|insert\s+into|alter\s+table)\b/i;
const ALWAYS_SQL = new Set(["public", "graveyard"]);

/** True when the match at `idx` is inside a comment (whole-line or trailing `//`). */
function inComment(text: string, idx: number): boolean {
  const t = text.trimStart();
  if (/^(\/\/|\*|\/\*|\*\/|<!--|#)/.test(t)) return true;
  const before = text.slice(0, idx);
  return before.includes("//") && !/https?:$/.test(before.replace(/\/[^/]*$/, "/"));
}

export function checkQualifiedRefs(ctx: Context): Finding[] {
  const { snapshot: snap } = ctx;
  if (snap.tables.size === 0) return [];
  const liveSchemas = new Set([...snap.tables.keys(), ...snap.views.keys()]);
  const findings: Finding[] = [];

  for (const file of ctx.codeFiles) {
    const { lines } = file;
    let literalRanges: Array<[number, number]> | undefined;
    let offset = 0;
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const lineOffset = offset;
      offset += text.length + 1;
      if (isIgnored(text)) continue;
      const sqlish = SQL_KEYWORD.test(text);
      PAIR_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PAIR_RE.exec(text))) {
        const schema = m[1];
        const rel = m[2];
        if (ctx.deadOldNames.has(rel)) continue;
        // Candidate only if the prefix is a real schema (or always-SQL public/graveyard).
        if (!ALWAYS_SQL.has(schema) && !liveSchemas.has(schema)) continue;
        if (relationExists(snap, schema, rel)) continue; // correct as written
        const livesIn = [...(snap.relationSchemas.get(rel) ?? [])].filter((s) => s !== schema).sort();
        if (!livesIn.length) continue; // a function/view/random dotted token — skip
        // In JS/TS a member access is never a SQL relation. A method named join
        // or a property named table must not turn provider.scopes/meta.table into
        // executable SQL. Inspect string/template text, excluding interpolations.
        if (file.ext !== ".sql" && !inComment(text, m.index)) {
          if (!literalRanges) {
            literalRanges = [];
            const source = ts.createSourceFile(file.path, lines.join("\n"), ts.ScriptTarget.Latest, true);
            const visit = (node: ts.Node): void => {
              if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
                || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
                literalRanges!.push([node.getStart(source), node.getEnd()]);
              }
              ts.forEachChild(node, visit);
            };
            visit(source);
          }
          const position = lineOffset + m.index;
          // `m` is a `let` the callback closes over, so its non-null narrowing
          // does not survive into the predicate — take the length out here.
          const matchLength = m[0].length;
          if (!literalRanges.some(([start, end]) => position >= start && position + matchLength <= end)) continue;
        }
        // A line that already names the correct location (e.g. "moved to graveyard.prompts")
        // is documenting the move, not making a stale reference — skip it.
        if (livesIn.some((s) => text.includes(`${s}.${rel}`))) continue;

        // ERROR only on a genuinely SQL-ish, non-comment line (raw SQL that executes).
        // A bare `schema.table` mention in a comment or a log/message string is
        // documentation, not a runtime ref — downgrade to WARN (a public/graveyard
        // prefix) or skip (any other prefix needs SQL context to be a real ref).
        const executable = sqlish && !inComment(text, m.index);
        let severity: "error" | "warn";
        if (executable) severity = "error";
        else if (ALWAYS_SQL.has(schema) || sqlish) severity = "warn";
        else continue;
        findings.push({
          check: "qualified-refs",
          severity,
          message: `"${schema}.${rel}" is not a live relation in "${schema}"; "${rel}" lives in ${livesIn.map((s) => `"${s}"`).join(", ")}.${severity === "warn" ? " (in a comment/string — stale doc?)" : ""}`,
          location: loc(file, i),
          fix: `Use ${livesIn[0]}.${rel}.`,
        });
      }
    }
  }
  return findings;
}

registerCheck("qualified-refs", checkQualifiedRefs);
