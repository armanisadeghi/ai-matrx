import type { FcResult, FcSetRow } from "@/features/flashcards/data/types";

export const FASTFIRE_INITIAL_LOAD_TIMEOUT_MS = 20_000;
export const FASTFIRE_SURFACE_LOAD_TIMEOUT_MESSAGE =
  "FastFire took too long to load. Try again.";
export const FASTFIRE_SETS_LOAD_TIMEOUT_MESSAGE =
  "Your flashcard sets took too long to load. Try again.";

/**
 * The browser cannot abort a JavaScript chunk request, but it can stop waiting
 * for one. This gives the code-split surface the same honest, retryable
 * terminal boundary as data reads; a late chunk is ignored by its caller.
 */
export async function loadFastFireSurface<T>(
  load: () => Promise<T>,
): Promise<T> {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    return await Promise.race([
      load(),
      new Promise<never>((_, reject) => {
        timeoutId = globalThis.setTimeout(
          () => reject(new Error(FASTFIRE_SURFACE_LOAD_TIMEOUT_MESSAGE)),
          FASTFIRE_INITIAL_LOAD_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
  }
}

/** Abort the real Supabase read when its setup skeleton reaches its limit. */
export async function loadFastFireSets(
  load: (signal: AbortSignal) => Promise<FcResult<FcSetRow[]>>,
): Promise<FcResult<FcSetRow[]>> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    FASTFIRE_INITIAL_LOAD_TIMEOUT_MS,
  );
  try {
    const result = await load(controller.signal);
    return controller.signal.aborted
      ? { data: null, error: FASTFIRE_SETS_LOAD_TIMEOUT_MESSAGE }
      : result;
  } catch (error) {
    if (controller.signal.aborted) {
      return { data: null, error: FASTFIRE_SETS_LOAD_TIMEOUT_MESSAGE };
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}
