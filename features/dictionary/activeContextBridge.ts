// features/dictionary/activeContextBridge.ts
//
// The dictionary follows the ONE global active context (appContextSlice). There
// is a single context for the whole UI — set it anywhere (the chat, the war
// room) and it applies everywhere. Ambient read-aloud playback resolves its
// dictionary from that context, NOT from a per-surface selection. Flip context
// → the next utterance uses the new context's dictionary.
//
// Explicit document-production surfaces (podcast / scribe) still pass their own
// surface key to override; this bridge is the default for everything else.
//
// Store-level (non-React) so TTS engines can use it without threading state
// through every callsite. Best-effort: playback must never break because the
// dictionary couldn't resolve.

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { ensureResolved } from "@/features/dictionary/redux/dictionarySlice";
import {
  selectDictTtsAliasesForSurface,
} from "@/features/dictionary/redux/selectors";
import {
  DEFAULT_DICT_SELECTION,
  type DictSelection,
  type DictPronunciation,
} from "@/features/dictionary/types";
import {
  selectEffectiveOrganizationId,
  selectActiveScopeTypeIds,
} from "@/lib/redux/slices/appContextSlice";
import { selectActiveScopeIds } from "@/features/scopes/redux/selectors/active-context";

/** Stable cache key for the resolved active-context dictionary. */
export const ACTIVE_CONTEXT_DICTIONARY_SURFACE = "active-context";

/**
 * Translate the single global app context into a dictionary selection:
 * personal + global (always, via the RPC) plus the active org, active
 * scope-types, and active scopes. Most-specific-wins is applied downstream by
 * `dict_resolve`. Pure + fully typed so it can be unit-tested off the primitives.
 */
export function buildDictSelectionFromContext(
  organizationId: string | null,
  scopeTypeIds: readonly string[],
  scopeIds: readonly string[],
): DictSelection {
  return {
    ...DEFAULT_DICT_SELECTION,
    includePersonal: true,
    all: false,
    organizationIds: organizationId ? [organizationId] : [],
    scopeTypeIds: [...scopeTypeIds],
    scopeIds: [...scopeIds],
  };
}

async function ensureActiveContextResolved() {
  const store = getStoreSingleton();
  if (!store) return null;
  // getState() is `any` by the store-singleton's cycle-free design; the
  // appContext selectors carry their own typed state param.
  const state = store.getState();
  const selection = buildDictSelectionFromContext(
    selectEffectiveOrganizationId(state),
    selectActiveScopeTypeIds(state),
    selectActiveScopeIds(state),
  );
  await (store.dispatch as (t: unknown) => Promise<void>)(
    ensureResolved(ACTIVE_CONTEXT_DICTIONARY_SURFACE, selection),
  );
  return store;
}

/** Read-aloud pronunciation pairs for the current global context. Best-effort. */
export async function resolveActiveContextTtsAliases(): Promise<DictPronunciation[]> {
  try {
    const store = await ensureActiveContextResolved();
    if (!store) return [];
    return (
      selectDictTtsAliasesForSurface(ACTIVE_CONTEXT_DICTIONARY_SURFACE)(store.getState()) ?? []
    );
  } catch {
    return [];
  }
}
