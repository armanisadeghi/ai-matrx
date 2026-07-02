/**
 * Auto-discovers the canonical `<name>Db(client)` schema-binder helpers
 * (`utils/supabase/workspaceDb.ts`, `docprocDb.ts`, `graveyardDb.ts`, …) —
 * every one follows `export function xDb(client) { return client.schema("S"); }`.
 *
 * Before this, `direct-from-schema` treated ANY call-expression receiver
 * (`xDb(supabase).from(...)`) as ambiguous and skipped it — meaning every
 * wrapper-bound call in the codebase was invisible to the live-truth check,
 * including calls through a totally wrong wrapper. Discovering the binders
 * here lets the check treat `xDb(...)` exactly like an explicit `.schema("S")`.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const BINDER_RE = /export function (\w+)[^(]*\(client[^)]*\)\s*{\s*return client\.schema\(\s*["']([a-z_][a-z0-9_]*)["']\s*\)/;

/** wrapper function name -> the schema it binds to, e.g. "docprocDb" -> "docproc". */
export function discoverSchemaBinders(root: string): Map<string, string> {
  const binders = new Map<string, string>();
  const dir = join(root, "utils/supabase");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return binders;
  }
  for (const name of names) {
    if (!name.endsWith(".ts")) continue;
    let content: string;
    try {
      content = readFileSync(join(dir, name), "utf8");
    } catch {
      continue;
    }
    const m = content.match(BINDER_RE);
    if (m) binders.set(m[1], m[2]);
  }
  return binders;
}
