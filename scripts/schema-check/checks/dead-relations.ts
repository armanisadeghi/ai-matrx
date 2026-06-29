/**
 * dead-relations — the original clean-cut enforcer, now a registered check.
 *
 * Reads scripts/dead-relations.json (mirror of platform.deprecated_relations) and
 * scans source for references to each OLD name — bare `.from("notes")`, qualified
 * `public.notes`, and typed `Database["public"]["Tables"]["notes"]`. These names
 * NO LONGER EXIST (clean-cut doctrine: no shim), so every hit ERRORs at runtime.
 *
 * This is the curated/annotated half of the truth check: it gives a precise,
 * human-authored "moved on <date> because <reason>" message for KNOWN moves. The
 * live-truth checks (direct-from-schema, typed-refs, qualified-refs) cover
 * everything else — they defer any relation listed here so there's no double-report.
 */
import { isIgnored, loc, registerCheck } from "../context";
import type { Context, Finding } from "../types";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function check(ctx: Context): Finding[] {
  const findings: Finding[] = [];
  for (const file of ctx.codeFiles) {
    const { lines } = file;
    for (const entry of ctx.deadRelations) {
      const r = esc(entry.relation);
      const oldSchema = entry.old.split(".")[0];
      const os = esc(oldSchema);
      const ns = entry.newSchema;
      const bare = new RegExp(`\\.(from|table)\\(\\s*['"\\\`]${r}['"\\\`]`);
      const qualified = new RegExp(`\\b${os}\\.${r}\\b`);
      const typed = new RegExp(
        `Database\\[\\s*['"]${os}['"]\\s*\\]\\[\\s*['"]Tables['"]\\s*\\]\\[\\s*['"]${r}['"]`,
      );
      lines.forEach((text, i) => {
        if (isIgnored(text)) return;
        // The `.schema("<new>")` qualifier is often on a PRECEDING line of a
        // multiline chain — evaluate the new-schema signal over the whole chain.
        let chainStart = i;
        while (chainStart > 0 && lines[chainStart].trim().startsWith(".")) chainStart--;
        const chain = lines.slice(chainStart, i + 1).join("\n");
        const hasNewSchema =
          chain.includes(`schema("${ns}")`) ||
          chain.includes(`schema('${ns}')`) ||
          chain.includes(`"${ns}"`) ||
          chain.includes(`'${ns}'`);
        let kind = "";
        if (bare.test(text) && !hasNewSchema) kind = "bare .from/.table (resolves to old schema)";
        else if (typed.test(text)) kind = `Database["${oldSchema}"] type ref`;
        else if (qualified.test(text) && !text.includes(entry.new)) kind = `qualified ${entry.old}`;
        if (!kind) return;
        findings.push({
          check: "dead-relations",
          severity: "error",
          message: `${entry.old} → ${entry.new} (since ${entry.since}) — ${entry.reason} [${kind}]`,
          location: loc(file, i),
          fix: `Repoint to ${entry.new}: bare .from("${entry.relation}") → .schema("${ns}").from("${entry.relation}"); ${oldSchema}.${entry.relation} → ${entry.new}; Database["${oldSchema}"] → Database["${ns}"].`,
        });
      });
    }
  }
  return findings;
}

registerCheck("dead-relations", check);
