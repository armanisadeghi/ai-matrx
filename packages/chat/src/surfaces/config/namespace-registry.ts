/**
 * Surface config namespace registry — the code-first contract for
 * `ui.ui_surface_config` rows.
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

// ---------------------------------------------------------------------------
// "menu" — THE EXCLUSION VALVE (THE-MODEL law 3: "A place may explicitly
// exclude"). Phase 6.7 made context-menu availability DERIVED — an item is
// offered wherever every key it consumes has a read path
// (`features/context-menu-v3/model/requirement-gate.ts`). This namespace is
// the one sanctioned override: a surface names the item ids it refuses even
// though they qualify.
//
// WHY HERE and not a new column: the valve belongs to the PLACE, not the
// item, and this registry is the platform's existing per-surface authored
// config — already layered global → org → scope → user, already fetched once
// per surface by `useSurfaceConfig` (which the menu already calls for agent
// roles), already editable in the surface admin detail. Zero SQL, and it is
// storage-position-agnostic: it never names `agent.shortcut` OR
// `mandate.vw_shortcut`, only the ids both of them carry.
//
// MERGE = UNION, and it is deliberately one-way. An org may exclude more than
// the platform did and a user more than their org did; no tier can RE-ADMIT
// what a weaker tier excluded. A valve that can be re-opened from a stronger
// tier is a second gate, and law 3 allows exactly one override.
// ---------------------------------------------------------------------------

export interface MenuConfig {
  /**
   * Menu item ids (shortcut / mandate ids — the same id on both storage
   * positions) this surface refuses. Absent or empty = nothing excluded.
   */
  excludedItemIds?: string[];
}

registerNamespace<MenuConfig>({
  namespace: "menu",
  validate: (input): input is MenuConfig => {
    if (!isPlainObject(input)) return false;
    const ids = (input as MenuConfig).excludedItemIds;
    return (
      ids === undefined ||
      (Array.isArray(ids) && ids.every((id) => typeof id === "string"))
    );
  },
  merge: (layers) => {
    const excluded = new Set<string>();
    for (const layer of layers) {
      for (const id of layer.excludedItemIds ?? []) {
        if (id) excluded.add(id);
      }
    }
    return excluded.size > 0 ? { excludedItemIds: [...excluded] } : {};
  },
  empty: {},
});

// ---------------------------------------------------------------------------
// "listening" — app-wide speech playback defaults (voice / speed / language),
// layered system → org → user (user wins). Hosted on the listening HOME
// surface (`matrx-user/assistant-message`, see
// features/audio/service/listeningConfig.ts) because speech is app-wide, not
// per-surface: every TTS consumer (`speak()`, the app-root streaming speaker,
// the Listen panel) resolves through this ONE namespace. The system default
// is the platform-global row (editable at
// /administration/ui/surfaces/matrx-user/assistant-message); orgs and users
// override per-field. Fields are OPTIONAL on purpose — an absent field falls
// through to the weaker tier, so a user who only chose a voice still gets
// the org/system speed.
// ---------------------------------------------------------------------------

export interface ListeningConfig {
  /** Cartesia voice id. Empty string = "no explicit choice" (purpose default). */
  voice?: string;
  /** generation_config speed (0.6–1.5; 1.0 = original). */
  speed?: number;
  /** BCP-47-ish language code (e.g. "en"). */
  language?: string;
}

registerNamespace<ListeningConfig>({
  namespace: "listening",
  validate: (input): input is ListeningConfig => {
    if (!isPlainObject(input)) return false;
    const { voice, speed, language } = input as ListeningConfig;
    return (
      (voice === undefined || typeof voice === "string") &&
      (speed === undefined || typeof speed === "number") &&
      (language === undefined || typeof language === "string")
    );
  },
  // Per-field shallow merge: a stronger tier's ABSENT field must not erase the
  // weaker tier's value, so drop undefined keys before assigning.
  merge: (layers) => {
    const out: ListeningConfig = {};
    for (const layer of layers) {
      if (layer.voice !== undefined) out.voice = layer.voice;
      if (layer.speed !== undefined) out.speed = layer.speed;
      if (layer.language !== undefined) out.language = layer.language;
    }
    return out;
  },
  empty: {},
});
