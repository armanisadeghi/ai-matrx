/**
 * panelKeyAliases — the ONE place a `?panels=` token key that is not a
 * window's own address is mapped to the key that window actually registers.
 *
 * 🚨 V-29 NEW-1 (2026-09-20). `?panels=files:<id>` is a legacy alias: its
 * hydrator opens `cloudFilesWindow`, and that window publishes its address
 * under `cloud_files` (its registry `urlSync.key`). `UrlPanelManager` compared
 * RAW token keys, so `files` could never be satisfied by the registration it
 * had itself caused: the address was rewritten to
 * `cloud_files:cloudFilesWindow,files:root` — two tokens for ONE window — and
 * at the notice deadline the person was told on screen, in a red-tier durable
 * `url-panel-unopened` incident, that a window plainly in front of them could
 * not be opened. Law 4 inverted: a false alarm is a lie too.
 *
 * The rule this file exists to hold: A TOKEN RESOLVED THROUGH AN ALIAS IS
 * SETTLED THE MOMENT ITS CANONICAL KEY REGISTERS. Everything the manager
 * compares — the unresolved set, the "already represented" check that keeps a
 * kept token from duplicating a live one, and the announcement — runs in
 * canonical space; only the sentence a person reads uses the key they pasted.
 *
 * ADDING AN ALIAS: put it here and nowhere else. The dev-only integrity check
 * at the end of `initUrlHydration.ts` refuses an alias whose key has no
 * hydrator, and one whose canonical target is not a registry `urlSync.key`.
 */

/**
 * alias token key → the `urlSync.key` the window it opens registers under.
 * A key absent from this map is its own canonical key.
 */
export const PANEL_KEY_ALIASES: Readonly<Record<string, string>> = {
  // The pre-Phase-6 name for the Cloud Files window. Links carrying it are in
  // the wild (docs, chats, the extension), so the hydrator stays — it is the
  // ADDRESS that is canonicalised once the window is up.
  files: "cloud_files",
};

/**
 * The key a token is judged by. Identity for every non-alias key, so callers
 * never need to know whether a key is aliased.
 */
export function resolveCanonicalTypeKey(typeKey: string): string {
  return PANEL_KEY_ALIASES[typeKey] ?? typeKey;
}
