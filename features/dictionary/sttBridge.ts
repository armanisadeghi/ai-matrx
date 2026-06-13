// features/dictionary/sttBridge.ts
//
// Store-level bridge so the audio recording hooks (features/audio) can apply
// dictionary-derived Whisper prompt biasing WITHOUT importing React state or
// threading the dictionary through every callsite. Reads the runtime store
// singleton, resolves the surface's dictionary from the user's stored
// selection, and returns the STT prompt string ("" when unavailable).

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { ensureDictionaryForSurfaceFromStore } from "@/features/dictionary/redux/dictionarySlice";
import { selectDictSttPromptForSurface } from "@/features/dictionary/redux/selectors";

/**
 * Resolve + read the STT prompt for a surface key. Best-effort: returns "" if
 * the store isn't ready, the user isn't authenticated, or resolution fails —
 * transcription must never break because the dictionary couldn't load.
 */
export async function resolveDictionarySttPrompt(surfaceKey: string): Promise<string> {
  const store = getStoreSingleton();
  if (!store || !surfaceKey) return "";
  try {
    // dispatch accepts thunks; the structural AppStore type is `any`-typed.
    await (store.dispatch as (t: unknown) => Promise<void>)(
      ensureDictionaryForSurfaceFromStore(surfaceKey),
    );
    return selectDictSttPromptForSurface(surfaceKey)(store.getState()) ?? "";
  } catch {
    return "";
  }
}
