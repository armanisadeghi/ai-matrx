// features/dictionary/types.ts
//
// Custom Dictionary — terminology + pronunciation entries attachable at four
// owner levels. Shared types for the whole feature (service, redux, hooks, UI).
//
// The DB is the source of truth: these mirror dict_entries / dict_settings and
// the dict_* RPC return shapes in types/database.types.ts. Do NOT fork a second
// entry shape — extend this one.

/** The four levels a dictionary can attach to. */
export type DictLevel = "user" | "organization" | "scope_type" | "scope";

/** A single dictionary entry as edited/managed for one owner. */
export interface DictEntry {
  id: string;
  term: string;
  /** Common mishearings / aliases — fed to STT keyterm biasing + TTS aliasing. */
  sounds_like: string[];
  /** Human-readable respelling, e.g. "kuh-MAH-luh". */
  pronunciation: string | null;
  /** IPA, for engines that accept phonemes (e.g. ElevenLabs). */
  ipa: string | null;
  /** What the term means / when it applies — context for the LLM. */
  definition: string | null;
  category: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/** A draft entry on its way into dict_upsert_entries (id optional = insert). */
export type DictEntryDraft = {
  id?: string;
  term: string;
  sounds_like?: string[];
  pronunciation?: string | null;
  ipa?: string | null;
  definition?: string | null;
  category?: string | null;
  is_active?: boolean;
};

/** Identifies one dictionary owner. owner_id is the user/org/scope-type/scope id. */
export interface DictOwnerRef {
  level: DictLevel;
  ownerId: string;
}

/** One owner row from dict_list_owners (entry counts + inline-policy setting). */
export interface DictOwner {
  level: DictLevel;
  owner_id: string;
  name: string;
  organization_id?: string | null;
  scope_type_id?: string | null;
  entry_count: number;
  /** null = inherits the 200-char default; 0 = never inline; N = custom ceiling. */
  max_inline_chars: number | null;
}

/** dict_list_owners() return shape — everything the user can attach to. */
export interface DictOwnerCatalogue {
  personal: DictOwner;
  organizations: DictOwner[];
  scope_types: DictOwner[];
  scopes: DictOwner[];
}

/** Which dictionaries to merge for a surface. Default = personal only. */
export interface DictSelection {
  /** Include the user's personal dictionary (default true). */
  includePersonal: boolean;
  /** Merge EVERYTHING visible (overrides the id lists). */
  all: boolean;
  organizationIds: string[];
  scopeTypeIds: string[];
  scopeIds: string[];
  /**
   * Per-task ("situational") entries the user attached to THIS surface only —
   * not saved to any tier, applied on top of (and overriding) the resolved
   * persistent dictionary. Lives in surface-user-state; clear it when the task
   * ends. These ride the TTS request as `dictionary.custom_entries`.
   */
  customEntries?: DictEntryDraft[];
}

export const DEFAULT_DICT_SELECTION: DictSelection = {
  includePersonal: true,
  all: false,
  organizationIds: [],
  scopeTypeIds: [],
  scopeIds: [],
  customEntries: [],
};

/** A merged, de-duplicated entry with source attribution. */
export interface ResolvedDictEntry {
  id: string;
  term: string;
  sounds_like: string[];
  pronunciation: string | null;
  ipa: string | null;
  definition: string | null;
  category: string | null;
  /** A saved tier, or "custom" for a per-task entry attached to this surface. */
  source_level: DictLevel | "custom";
  source_name: string;
}

/** dict_resolve() return shape. */
export interface ResolvedDictionary {
  entries: ResolvedDictEntry[];
  /** Most-specific owner inline-policy setting present, or null for default. */
  effective_max_inline_chars: number | null;
  source_count: number;
}

/** A term→pronunciation substitution pair for TTS preprocessing. */
export interface DictPronunciation {
  from: string;
  to: string;
}

/** Derived, ready-to-consume outputs computed from a ResolvedDictionary. */
export interface DictConsumption {
  resolved: ResolvedDictionary;
  /** Whisper `prompt` biasing string (capped to the 224-token window). */
  sttPrompt: string;
  /** TTS substitution pairs (term + sounds_like → pronunciation). */
  ttsAliases: DictPronunciation[];
  /** Markdown block for LLM context injection (cleanup agents etc.). */
  contextBlock: string;
  /**
   * Per-task entries that were folded into the outputs above — surfaced
   * separately so a request payload can send them as `dictionary.custom_entries`
   * (the backend applies them as the situational set, overriding persistent).
   */
  customEntries: DictEntryDraft[];
}

/** The 200-char default ceiling, mirrored from the agent context-slot policy. */
export const DICT_DEFAULT_INLINE_CHARS = 200;

/** Groq Whisper keeps the FINAL ~224 tokens of the prompt; stay well under. */
export const DICT_STT_PROMPT_CHAR_CAP = 800;
