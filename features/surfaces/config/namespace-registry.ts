/**
 * Surface config namespace registry — the code-first contract for
 * `public.ui_surface_config` rows.
 *
 * A namespace is a typed bucket of per-surface configuration (dictionary,
 * session_defaults, tools, …) stored as scoped JSONB rows and resolved by
 * layered merge (global → org-by-membership → [ctx scope, reserved] → user).
 * Each namespace registers a handler here: its validator, its merge
 * semantics, and its empty value. Adding a namespace is this file + a
 * manifest `configNamespaces` line — zero SQL.
 *
 * Handlers stay PURE (no React, no IO) so the resolution service, hooks,
 * admin views, and future server-side consumers share one implementation.
 */

export interface NamespaceHandler<T = unknown> {
  namespace: string;
  /** Reject malformed rows loudly — a bad org row must not poison the merge. */
  validate(input: unknown): input is T;
  /** Merge ordered layers, weakest → strongest. */
  merge(layers: T[]): T;
  empty: T;
}

const registry = new Map<string, NamespaceHandler>();

export function registerNamespace<T>(handler: NamespaceHandler<T>): void {
  if (registry.has(handler.namespace)) {
    throw new Error(
      `[surfaces] namespace "${handler.namespace}" registered twice`,
    );
  }
  registry.set(handler.namespace, handler as NamespaceHandler);
}

export function getNamespaceHandler(
  namespace: string,
): NamespaceHandler | undefined {
  return registry.get(namespace);
}

export function listRegisteredNamespaces(): string[] {
  return [...registry.keys()].sort();
}

/** Shallow per-top-level-key object merge — the default for form-style config. */
function shallowObjectMerge(
  layers: Record<string, unknown>[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const layer of layers) Object.assign(out, layer);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// "session_defaults" — seed values for feature-owned per-session settings
// (transcript-studio's cleaning/concept/module shortcut ids + intervals).
// Per-session rows stay feature-owned; this namespace only supplies the
// defaults a NEW session starts from.
// ---------------------------------------------------------------------------

export interface SessionDefaultsConfig extends Record<string, unknown> {}

registerNamespace<SessionDefaultsConfig>({
  namespace: "session_defaults",
  validate: (input): input is SessionDefaultsConfig => isPlainObject(input),
  merge: shallowObjectMerge,
  empty: {},
});

// ---------------------------------------------------------------------------
// "dictionary" — term corrections + custom pronunciations, layered org+user.
// Applied at launch as the reserved `user_dictionary` surface value (see
// features/surfaces/config/dictionary.ts for the renderer; registered here
// so rows validate/merge consistently everywhere).
// ---------------------------------------------------------------------------

export interface DictionaryEntry {
  /** The wrong/transcribed form (e.g. "matrix"). */
  wrong: string;
  /** The correct form (e.g. "Matrx"). */
  right: string;
  note?: string;
  matchCase?: boolean;
}

export interface PronunciationEntry {
  word: string;
  pronunciation: string;
  note?: string;
}

export interface DictionaryConfig {
  terms: DictionaryEntry[];
  pronunciations: PronunciationEntry[];
}

const EMPTY_DICTIONARY: DictionaryConfig = { terms: [], pronunciations: [] };

registerNamespace<DictionaryConfig>({
  namespace: "dictionary",
  validate: (input): input is DictionaryConfig => {
    if (!isPlainObject(input)) return false;
    const terms = (input as { terms?: unknown }).terms;
    const prons = (input as { pronunciations?: unknown }).pronunciations;
    return (
      (terms === undefined || Array.isArray(terms)) &&
      (prons === undefined || Array.isArray(prons))
    );
  },
  // List-concat; later layers win on duplicate keys (case-insensitive
  // `wrong` / `word`), so a user's correction overrides the org's.
  merge: (layers) => {
    const termByKey = new Map<string, DictionaryEntry>();
    const pronByKey = new Map<string, PronunciationEntry>();
    for (const layer of layers) {
      for (const t of layer.terms ?? []) {
        if (t?.wrong) termByKey.set(t.wrong.toLowerCase(), t);
      }
      for (const p of layer.pronunciations ?? []) {
        if (p?.word) pronByKey.set(p.word.toLowerCase(), p);
      }
    }
    return {
      terms: [...termByKey.values()],
      pronunciations: [...pronByKey.values()],
    };
  },
  empty: EMPTY_DICTIONARY,
});
