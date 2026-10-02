// lib/reversible/reversibleCounts.ts
//
// THE PERSON'S HISTORY WITH REVERSIBLE ACTIONS — read from and written to their synced preferences
// (`userPreferences.reversible`, `lib/redux/preferences/userPreferencesSlice.ts`). The rules for
// what is counted and how a tier is chosen live once, in `@ai-matrx/kit/reversible`; this module is
// only the binding to this app's store.

import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { setModulePreferences, type ReversiblePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  countReversible,
  reversibleTier,
  type ReversibleTier,
  type ReversibleVerb,
} from "@ai-matrx/kit/reversible";

interface PreferencesState {
  userPreferences?: {
    reversible?: ReversiblePreferences;
    _meta?: { loadStatus?: "loading" | "loaded" | "failed" };
  };
}

function preferences(): PreferencesState["userPreferences"] | undefined {
  const store = getStoreSingleton();
  if (!store) return undefined;
  return (store.getState() as PreferencesState).userPreferences;
}

/**
 * The tier this action gets. While the person's saved preferences have not loaded, their counts
 * are unknown — a veteran must not be taught as if new, and a newcomer must not get a bare toast —
 * so an unknown history reads as `guide`, never `teach` or `plain`.
 */
export function tierForThisPerson(verb: ReversibleVerb, noun: string): ReversibleTier {
  const prefs = preferences();
  if (prefs?._meta?.loadStatus !== "loaded") return "guide";
  return reversibleTier(prefs.reversible, verb, noun);
}

/** One more successful action, persisted through the preferences sync engine. Undo never calls it. */
export function countThisPersonsAction(verb: ReversibleVerb, noun: string): void {
  const store = getStoreSingleton();
  if (!store) return;
  const next = countReversible(preferences()?.reversible, verb, noun);
  store.dispatch(setModulePreferences({ module: "reversible", preferences: next }));
}
