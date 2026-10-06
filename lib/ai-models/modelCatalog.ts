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

import {
  createModelCatalog,
  createModelFavorites,
  setModelDiagnosticsSink,
  type ModelCatalog,
  type ModelCatalogClient,
  type ModelFavorites,
  type ModelFavoritesClient,
} from "@ai-matrx/agents/models";
import { createClient, supabase } from "@/utils/supabase/client";
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
      source: entry.source,
      ...(entry.relation ? { relation: entry.relation } : {}),
      message: entry.message,
      ...(entry.details ? { details: entry.details } : {}),
    });
  });
}

export function getModelCatalog(): ModelCatalog {
  if (!catalog) {
    bindDiagnostics();
    // supabase-js satisfies the package's structural client as-is; the cast narrows this app's
    // generated `Database` generics onto the package's deliberately generic seam.
    catalog = createModelCatalog({ client: supabase as unknown as ModelCatalogClient, errorSink: sink });
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
