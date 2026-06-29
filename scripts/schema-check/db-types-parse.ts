/**
 * Parse the Supabase-generated `types/database.types.ts` and the `pnpm db-types`
 * schema list out of package.json. Both describe what the FRONTEND assumes the
 * schema is; the checks diff that against the live snapshot.
 *
 * The generated file is formatted by `supabase gen types` with a stable 2-space
 * indent, so an indentation state-machine parses it reliably without a TS AST:
 *
 *   export type Database = {
 *     <schema>: {            // 2 spaces  -> schema
 *       Tables: {            // 4 spaces  -> section
 *         <table>: {         // 6 spaces  -> relation name (Row/Insert at 8 spaces, ignored)
 *       Views: { <view>: { … } }
 */

export interface ParsedTypes {
  /** schema -> Set(table names) declared under Tables. */
  tables: Map<string, Set<string>>;
  /** schema -> Set(view names) declared under Views. */
  views: Map<string, Set<string>>;
}

const SECTION = new Set(["Tables", "Views", "Functions", "Enums", "CompositeTypes"]);

export function parseGeneratedTypes(content: string): ParsedTypes {
  const tables = new Map<string, Set<string>>();
  const views = new Map<string, Set<string>>();

  const lines = content.split("\n");
  let inDatabase = false;
  let schema: string | null = null;
  let section: string | null = null;

  for (const line of lines) {
    if (!inDatabase) {
      if (/^export type Database = \{/.test(line)) inDatabase = true;
      continue;
    }
    // 2-space key opening a block -> a schema (or __InternalSupabase, skipped below).
    let m = line.match(/^  ([A-Za-z_][A-Za-z0-9_]*): \{/);
    if (m) {
      schema = m[1] === "__InternalSupabase" ? null : m[1];
      section = null;
      continue;
    }
    // 4-space key -> a section within the current schema.
    m = line.match(/^    ([A-Za-z_][A-Za-z0-9_]*): \{/);
    if (m && schema) {
      section = SECTION.has(m[1]) ? m[1] : null;
      continue;
    }
    // 6-space key while inside Tables/Views -> a relation name.
    m = line.match(/^      ([A-Za-z_][A-Za-z0-9_]*): \{/);
    if (m && schema && (section === "Tables" || section === "Views")) {
      const bucket = section === "Tables" ? tables : views;
      (bucket.get(schema) ?? bucket.set(schema, new Set()).get(schema)!).add(m[1]);
    }
  }
  return { tables, views };
}

/** Extract the `--schema <name>` list the FE asks `pnpm db-types` to generate. */
export function parseDbTypesSchemaList(packageJsonText: string): Set<string> {
  const out = new Set<string>();
  let script = "";
  try {
    script = (JSON.parse(packageJsonText).scripts?.["db-types"] as string) ?? "";
  } catch {
    return out;
  }
  for (const m of script.matchAll(/--schema\s+([A-Za-z_][A-Za-z0-9_]*)/g)) out.add(m[1]);
  return out;
}
