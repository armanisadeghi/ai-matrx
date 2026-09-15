/**
 * Resolve the ONE Supabase connection (URL + key) the schema-check refresher uses.
 *
 * Key precedence is by NAME, never by position in a file: `SUPABASE_SECRET_KEY`
 * (service role — `public.schema_truth_snapshot()` is granted to service_role only)
 * beats `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (same database, lower privilege).
 * Process env beats .env files; earlier files beat later ones for the same name.
 *
 * Until 2026-09-14 the .env scan kept whichever key name appeared first in the
 * file; `.env.local` lists the publishable key one line above the secret key, so
 * every refresh sent the publishable key, the RPC answered 42501, and the refresher
 * fell back to the older aidream snapshot (fewer tables, no exposed schemas).
 */

export const URL_NAME = "NEXT_PUBLIC_SUPABASE_URL";
/** Highest privilege first. */
export const KEY_NAMES = ["SUPABASE_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;

export type SupabaseEnv = { url: string; key: string; keyName: (typeof KEY_NAMES)[number] };

/** Parse `NAME=value` lines (quotes stripped, comments/blank lines ignored). */
export function parseEnvText(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const v = (m[2] ?? "").replace(/^['"]|['"]$/g, "");
    if (v && !out.has(m[1]!)) out.set(m[1]!, v);
  }
  return out;
}

/**
 * @param processEnv  `process.env` (or a stand-in)
 * @param fileTexts   contents of the .env files, highest precedence first
 */
export function resolveSupabaseEnv(
  processEnv: Record<string, string | undefined>,
  fileTexts: string[],
): SupabaseEnv | null {
  const sources: Array<Map<string, string>> = [
    new Map(Object.entries(processEnv).filter((e): e is [string, string] => !!e[1])),
    ...fileTexts.map(parseEnvText),
  ];
  const lookup = (name: string) => sources.find((s) => s.has(name))?.get(name) ?? "";

  const url = lookup(URL_NAME);
  for (const keyName of KEY_NAMES) {
    const key = lookup(keyName);
    if (url && key) return { url, key, keyName };
  }
  return null;
}
