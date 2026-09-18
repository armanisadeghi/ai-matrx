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
import type { Context, DeadRelation, Finding } from "../types";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface IndexedRelation {
  entry: DeadRelation;
  typed: RegExp;
}

function addToIndex(
  index: Map<string, DeadRelation[]>,
  key: string,
  entry: DeadRelation,
) {
  const matches = index.get(key);
  if (matches) matches.push(entry);
  else index.set(key, [entry]);
}

function relationIndexes(entries: DeadRelation[]) {
  const byRelation = new Map<string, DeadRelation[]>();
  const byOldName = new Map<string, DeadRelation[]>();
  const matchers: IndexedRelation[] = [];
  for (const entry of entries) {
    addToIndex(byRelation, entry.relation, entry);
    addToIndex(byOldName, entry.old, entry);
    const oldSchema = entry.old.split(".")[0];
    const relation = esc(entry.relation);
    const schema = esc(oldSchema);
    matchers.push({
      entry,
      typed: new RegExp(
        "Database\\[\\s*['\"]" +
          schema +
          "['\"]\\s*\\]\\[\\s*['\"]Tables['\"]\\s*\\]\\[\\s*['\"]" +
          relation +
          "['\"]",
      ),
    });
  }
  const qualifiedRefs = new RegExp(
    "(?=(\\b(" + entries.map((entry) => esc(entry.old)).join("|") + ")\\b))",
    "g",
  );
  return { byRelation, byOldName, matchers, qualifiedRefs };
}

function matchingTypedRelations(
  text: string,
  matchers: IndexedRelation[],
): Set<DeadRelation> {
  const matches = new Set<DeadRelation>();
  if (!text.includes("Database[")) return matches;
  for (const { entry, typed } of matchers)
    if (typed.test(text)) matches.add(entry);
  return matches;
}

function matchingQualifiedRelations(
  text: string,
  byOldName: Map<string, DeadRelation[]>,
  qualifiedRefs: RegExp,
): Set<DeadRelation> {
  const matches = new Set<DeadRelation>();
  qualifiedRefs.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = qualifiedRefs.exec(text))) {
    for (const entry of byOldName.get(match[1]) ?? []) {
      if (!text.includes(entry.new)) matches.add(entry);
    }
    qualifiedRefs.lastIndex = match.index + 1;
  }
  return matches;
}

export function checkDeadRelations(ctx: Context): Finding[] {
  const findings: Finding[] = [];
  const { byRelation, byOldName, matchers, qualifiedRefs } = relationIndexes(
    ctx.deadRelations,
  );
  for (const file of ctx.codeFiles) {
    const { lines } = file;
    const findingsForEntry = new Map<DeadRelation, Finding[]>();
    // Resolves `.from(TABLE)` where TABLE is a local `const TABLE = "old_name"`,
    // and a chain already repointed via an explicit `.schema()`, a canonical
    // `<name>Db(client)` binder, or a local alias of either — not just a string
    // literal argument / literal `.schema("new")` text. See ../table-ref-resolution.ts
    // and ../chain-schema.ts (shared with direct-from-schema so the two checks agree).
    const isCode = file.ext !== ".sql";
    const content = lines.join("\n");
    const tableConsts = isCode
      ? buildTableConsts(content)
      : new Map<string, string>();
    const clientSchemas = isCode
      ? buildClientSchemas(content, ctx.schemaBinders)
      : new Map<string, string>();

    lines.forEach((text, i) => {
      if (isIgnored(text)) return;

      const bareRelations = new Set<string>();
      for (const call of resolveFromCalls(text, tableConsts)) {
        if (byRelation.has(call.rel)) bareRelations.add(call.rel);
      }
      const typedRelations = matchingTypedRelations(text, matchers);
      const qualifiedRelations = matchingQualifiedRelations(
        text,
        byOldName,
        qualifiedRefs,
      );
      const candidates = new Set<DeadRelation>([
        ...typedRelations,
        ...qualifiedRelations,
        ...[...bareRelations].flatMap(
          (relation) => byRelation.get(relation) ?? [],
        ),
      ]);
      if (!candidates.size) return;

      // This was formerly calculated once for every dead relation on every line.
      // It is only relevant when a candidate bare .from/.table call exists.
      const resolvedSchema =
        isCode && bareRelations.size
          ? resolvedChainSchema(lines, i, ctx.schemaBinders, clientSchemas)
              .schema
          : null;

      for (const entry of candidates) {
        const oldSchema = entry.old.split(".")[0];
        const hasBare = bareRelations.has(entry.relation);
        const hasNewSchema = resolvedSchema === entry.newSchema;
        let kind = "";
        if (hasBare && !hasNewSchema)
          kind = "bare .from/.table (resolves to old schema)";
        else if (typedRelations.has(entry))
          kind = 'Database["' + oldSchema + '"] type ref';
        else if (qualifiedRelations.has(entry)) kind = "qualified " + entry.old;
        if (!kind) continue;
        const entryFindings = findingsForEntry.get(entry) ?? [];
        entryFindings.push({
          check: "dead-relations",
          severity: "error",
          message:
            entry.old +
            " → " +
            entry.new +
            " (since " +
            entry.since +
            ") — " +
            entry.reason +
            " [" +
            kind +
            "]",
          location: loc(file, i),
          fix:
            "Repoint to " +
            entry.new +
            ': bare .from("' +
            entry.relation +
            '") → .schema("' +
            entry.newSchema +
            '").from("' +
            entry.relation +
            '"); ' +
            oldSchema +
            "." +
            entry.relation +
            " → " +
            entry.new +
            '; Database["' +
            oldSchema +
            '"] → Database["' +
            entry.newSchema +
            '"].',
        });
        findingsForEntry.set(entry, entryFindings);
      }
    });

    // Keep the registered check's former output order: file, registry entry, then line.
    for (const entry of ctx.deadRelations)
      findings.push(...(findingsForEntry.get(entry) ?? []));
  }
  return findings;
}

registerCheck("dead-relations", checkDeadRelations);
