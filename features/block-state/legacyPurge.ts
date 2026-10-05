// features/block-state/legacyPurge.ts
//
// One-time cleanup: before block state, a questionnaire's answers and the
// composer's unsent remark chips were kept in localStorage. They live
// server-side now, so those browser copies are dead weight (and stale). They are
// removed once per page load; nothing here reads or writes person-made state.

const LEGACY_PREFIXES = ["matrx:questionnaire-form:v1:", "matrx.composer-draft.remarks."];

export function purgeLegacyBrowserStores(): number {
  try {
    if (typeof window === "undefined") return 0;
    const store = window.localStorage;
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && LEGACY_PREFIXES.some((p) => key.startsWith(p))) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
    return doomed.length;
  } catch {
    return 0;
  }
}
