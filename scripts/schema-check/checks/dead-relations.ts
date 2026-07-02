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
import { buildTableConsts, resolveFromCalls } from "../table-ref-resolution";
import { buildClientSchemas, resolvedChainSchema } from "../chain-schema";
import type { Context, Finding } from "../types";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function check(ctx: Context): Finding[] {
  const findings: Finding[] = [];
  for (const file of ctx.codeFiles) {
    const { lines } = file;
    // Resolves `.from(TABLE)` where TABLE is a local `const TABLE = "old_name"`,
    // and a chain already repointed via an explicit `.schema()`, a canonical
    // `<name>Db(client)` binder, or a local alias of either — not just a string
    // literal argument / literal `.schema("new")` text. See ../table-ref-resolution.ts
    // and ../chain-schema.ts (shared with direct-from-schema so the two checks agree).
    const isCode = file.ext !== ".sql";
    const content = lines.join("\n");
    const tableConsts = isCode ? buildTableConsts(content) : new Map<string, string>();
    const clientSchemas = isCode ? buildClientSchemas(content, ctx.schemaBinders) : new Map<string, string>();
    for (const entry of ctx.deadRelations) {
      const r = esc(entry.relation);
      const oldSchema = entry.old.split(".")[0];
      const os = esc(oldSchema);
      const ns = entry.newSchema;
      const qualified = new RegExp(`\\b${os}\\.${r}\\b`);
      const typed = new RegExp(
        `Database\\[\\s*['"]${os}['"]\\s*\\]\\[\\s*['"]Tables['"]\\s*\\]\\[\\s*['"]${r}['"]`,
      );
      lines.forEach((text, i) => {
        if (isIgnored(text)) return;
        const hasBare = resolveFromCalls(text, tableConsts).some((c) => c.rel === entry.relation);
        const resolvedSchema = isCode
          ? resolvedChainSchema(lines, i, ctx.schemaBinders, clientSchemas).schema
          : null;
        // The `.schema("<new>")` qualifier (or an equivalent binder/alias) is often
        // established on a PRECEDING line of a multiline chain, or upstream of this
        // file entirely for a binder — `resolvedChainSchema` already accounts for both.
        const hasNewSchema = resolvedSchema === ns;
        let kind = "";
        if (hasBare && !hasNewSchema) kind = "bare .from/.table (resolves to old schema)";
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
