// lib/ai-models/modelCatalog.ts
//
// THE host wiring for `@ai-matrx/agents/models` — the ONE model catalog + favorites.
//
// The picker, its rows, filters, tiers, admin variant and stars live in the package (agent core
// A1); this app injects identity only:
//
//   client     → the app's browser Supabase client. Favorites take the GETTER so the write reads a
//                fresh browser client at call time (the module singleton can be the SSR-built
//                client with no live session, which made the write hang).
//   cache      → `userPreferences.aiModels.favoriteModels` in Redux, the instant-paint cache.
//   errorSink  → `captureError` (source "model-catalog"), the inspector every failure lands in.
//   diagnostics→ the capability parser's vocabulary-drift scream, into the same inspector.
//
// Both are created ONCE, lazily (a second catalog would be a second holder of the rows).

import { getModelCatalog as getChatModelCatalog } from "@ai-matrx/chat/agents/identity/model-catalog";
import {
  createModelFavorites,
  setModelDiagnosticsSink,
  type ModelCatalog,
  type ModelFavorites,
  type ModelFavoritesClient,
} from "@ai-matrx/agents/models";
import { createClient } from "@/utils/supabase/client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { selectFavoriteModelIds } from "@/lib/redux/preferences/userPreferenceSelectors";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";

let catalog: ModelCatalog | null = null;
let favorites: ModelFavorites | null = null;

const sink = (event: { code: string; message: string; context?: object }) => {
  captureError({
    source: "model-catalog",
    message: event.message,
    code: event.code,
    ...(event.context ? { raw: event.context } : {}),
  });
};

function bindDiagnostics(): void {
  setModelDiagnosticsSink((entry) => {
    captureError({
      // The parser reports vocabulary drift as a "data-shape" contract violation.
      source: entry.source === "data-shape" ? "data-shape" : "model-catalog",
      ...(entry.relation ? { relation: entry.relation } : {}),
      message: entry.message,
      ...(entry.details ? { details: entry.details } : {}),
    });
  });
}

/**
 * THE page's model catalog is chat's (agent core B3): the picker rows and the model records
 * (options, full records, class configs) are one instance, so chat's composer and this app's
 * pickers read the same holder. Read failures reach the Error Inspector through chat's host
 * diagnostics.
 */
export function getModelCatalog(): ModelCatalog {
  if (!catalog) {
    bindDiagnostics();
    catalog = getChatModelCatalog();
  }
  return catalog;
}

export function getModelFavorites(): ModelFavorites {
  if (!favorites) {
    favorites = createModelFavorites({
      client: () => createClient() as unknown as ModelFavoritesClient,
      errorSink: sink,
      cache: {
        get: () => {
          const store = getStoreSingleton();
          return store ? selectFavoriteModelIds(store.getState()) : [];
        },
        set: (ids) => {
          getStoreSingleton()?.dispatch(
            setPreference({ module: "aiModels", preference: "favoriteModels", value: ids }),
          );
        },
        subscribe: (listener) => getStoreSingleton()?.subscribe(listener) ?? (() => {}),
      },
    });
  }
  return favorites;
}
