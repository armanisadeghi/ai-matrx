// features/dictionary/ttsBridge.ts
//
// Store-level bridge so the TTS hooks (features/tts) can apply dictionary
// pronunciation substitutions without importing React state. Mirrors
// sttBridge.ts: resolves the surface's dictionary from the user's stored
// selection and returns term→spoken-form pairs for parseMarkdownToText.

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { ensureDictionaryForSurfaceFromStore } from "@/features/dictionary/redux/dictionarySlice";
import { selectDictTtsAliasesForSurface } from "@/features/dictionary/redux/selectors";
import type { DictPronunciation } from "@/features/dictionary/types";

/**
 * Resolve + read TTS pronunciation pairs for a surface key. Best-effort:
 * returns [] if the store isn't ready or resolution fails — speech must never
 * break because the dictionary couldn't load.
 */
export async function resolveDictionaryTtsAliases(
  surfaceKey: string,
): Promise<DictPronunciation[]> {
  const store = getStoreSingleton();
  if (!store || !surfaceKey) return [];
  try {
    await (store.dispatch as (t: unknown) => Promise<void>)(
      ensureDictionaryForSurfaceFromStore(surfaceKey),
    );
    return selectDictTtsAliasesForSurface(surfaceKey)(store.getState()) ?? [];
  } catch {
    return [];
  }
}
