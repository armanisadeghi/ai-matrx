// features/dictionary/redux/dictionarySlice.ts
//
// Cache + thunks for the Custom Dictionary feature:
//   • owners      — the dict_list_owners catalogue (selector UI).
//   • entriesByOwner — per-owner entry lists for the manager UI (key `level:id`).
//   • resolvedBySurface — the merged/deduped consumption bundle per surface key,
//     used by transcription/TTS surfaces. The *selection* itself lives in the
//     surface-user-state store; this slice holds the resolved RESULT.
//
// In-flight dedup + short TTL on every loader (per the file-fetch-duplication
// pattern) so remounts/double-clicks don't re-fetch.

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { AppThunk } from "@/lib/redux/store";
import { dictionaryService } from "@/features/dictionary/service/dictionaryService";
import { buildConsumption } from "@/features/dictionary/utils/format";
import {
  ensureSurfaceFeatureLoaded,
} from "@/features/surfaces/redux/userStateSlice";
import { DEFAULT_SURFACE_KEY } from "@/features/surfaces/user-state/service";
import {
  DEFAULT_DICT_SELECTION,
  type DictConsumption,
  type DictEntry,
  type DictLevel,
  type DictOwnerCatalogue,
  type DictSelection,
} from "@/features/dictionary/types";

type LoadStatus = "idle" | "loading" | "ready" | "error";

interface Cell<T> {
  data: T | null;
  status: LoadStatus;
  error: string | null;
  fetchedAt: number | null;
}

interface ResolvedCell extends Cell<DictConsumption> {
  selectionKey: string;
}

interface DictionaryState {
  owners: Cell<DictOwnerCatalogue>;
  entriesByOwner: Record<string, Cell<DictEntry[]>>;
  resolvedBySurface: Record<string, ResolvedCell>;
}

const emptyCell = <T>(): Cell<T> => ({ data: null, status: "idle", error: null, fetchedAt: null });

const initialState: DictionaryState = {
  owners: emptyCell(),
  entriesByOwner: {},
  resolvedBySurface: {},
};

export const ownerKey = (level: DictLevel, ownerId: string) => `${level}:${ownerId}`;

const slice = createSlice({
  name: "dictionary",
  initialState,
  reducers: {
    ownersLoading(state) {
      state.owners.status = "loading";
      state.owners.error = null;
    },
    ownersReceived(state, action: PayloadAction<DictOwnerCatalogue>) {
      state.owners = { data: action.payload, status: "ready", error: null, fetchedAt: Date.now() };
    },
    ownersError(state, action: PayloadAction<string>) {
      state.owners.status = "error";
      state.owners.error = action.payload;
    },

    entriesLoading(state, action: PayloadAction<string>) {
      const cell = state.entriesByOwner[action.payload] ?? emptyCell<DictEntry[]>();
      cell.status = "loading";
      cell.error = null;
      state.entriesByOwner[action.payload] = cell;
    },
    entriesReceived(state, action: PayloadAction<{ key: string; entries: DictEntry[] }>) {
      state.entriesByOwner[action.payload.key] = {
        data: action.payload.entries,
        status: "ready",
        error: null,
        fetchedAt: Date.now(),
      };
    },
    entriesError(state, action: PayloadAction<{ key: string; error: string }>) {
      const cell = state.entriesByOwner[action.payload.key] ?? emptyCell<DictEntry[]>();
      cell.status = "error";
      cell.error = action.payload.error;
      state.entriesByOwner[action.payload.key] = cell;
    },

    resolveLoading(state, action: PayloadAction<{ surfaceKey: string; selectionKey: string }>) {
      const cell = state.resolvedBySurface[action.payload.surfaceKey] ?? {
        ...emptyCell<DictConsumption>(),
        selectionKey: "",
      };
      cell.status = "loading";
      cell.error = null;
      cell.selectionKey = action.payload.selectionKey;
      state.resolvedBySurface[action.payload.surfaceKey] = cell;
    },
    resolveReceived(
      state,
      action: PayloadAction<{ surfaceKey: string; selectionKey: string; consumption: DictConsumption }>,
    ) {
      state.resolvedBySurface[action.payload.surfaceKey] = {
        data: action.payload.consumption,
        status: "ready",
        error: null,
        fetchedAt: Date.now(),
        selectionKey: action.payload.selectionKey,
      };
    },
    resolveError(state, action: PayloadAction<{ surfaceKey: string; error: string }>) {
      const cell = state.resolvedBySurface[action.payload.surfaceKey] ?? {
        ...emptyCell<DictConsumption>(),
        selectionKey: "",
      };
      cell.status = "error";
      cell.error = action.payload.error;
      state.resolvedBySurface[action.payload.surfaceKey] = cell;
    },
  },
});

export const dictionaryActions = slice.actions;
export const dictionaryReducer = slice.reducer;

// ── thunks (in-flight dedup + TTL) ────────────────────────────────────────

const TTL_MS = 30_000;
const inflightOwners = { p: null as Promise<void> | null };
const inflightEntries = new Map<string, Promise<void>>();
const inflightResolve = new Map<string, Promise<void>>();

export function ensureOwners(force = false): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const o = getState().dictionary.owners;
    if (!force && o.status === "ready" && o.fetchedAt && Date.now() - o.fetchedAt < TTL_MS) return;
    if (inflightOwners.p && !force) return inflightOwners.p;
    const p = (async () => {
      dispatch(dictionaryActions.ownersLoading());
      try {
        dispatch(dictionaryActions.ownersReceived(await dictionaryService.listOwners()));
      } catch (e) {
        dispatch(dictionaryActions.ownersError((e as Error).message));
      } finally {
        inflightOwners.p = null;
      }
    })();
    inflightOwners.p = p;
    return p;
  };
}

export function loadEntries(
  level: DictLevel,
  ownerId: string,
  force = false,
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const key = ownerKey(level, ownerId);
    const cell = getState().dictionary.entriesByOwner[key];
    if (!force && cell?.status === "ready" && cell.fetchedAt && Date.now() - cell.fetchedAt < TTL_MS)
      return;
    const pending = inflightEntries.get(key);
    if (pending && !force) return pending;
    const p = (async () => {
      dispatch(dictionaryActions.entriesLoading(key));
      try {
        const entries = await dictionaryService.listEntries(level, ownerId);
        dispatch(dictionaryActions.entriesReceived({ key, entries }));
      } catch (e) {
        dispatch(dictionaryActions.entriesError({ key, error: (e as Error).message }));
      } finally {
        inflightEntries.delete(key);
      }
    })();
    inflightEntries.set(key, p);
    return p;
  };
}

/** Resolve + cache the merged dictionary for a surface from its selection. */
export function ensureResolved(
  surfaceKey: string,
  selection: DictSelection,
  force = false,
): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    const selectionKey = JSON.stringify(selection);
    const cell = getState().dictionary.resolvedBySurface[surfaceKey];
    if (
      !force &&
      cell?.status === "ready" &&
      cell.selectionKey === selectionKey &&
      cell.fetchedAt &&
      Date.now() - cell.fetchedAt < TTL_MS
    )
      return;
    const dedupKey = `${surfaceKey}::${selectionKey}`;
    const pending = inflightResolve.get(dedupKey);
    if (pending && !force) return pending;
    const p = (async () => {
      dispatch(dictionaryActions.resolveLoading({ surfaceKey, selectionKey }));
      try {
        const resolved = await dictionaryService.resolve(selection);
        dispatch(
          dictionaryActions.resolveReceived({
            surfaceKey,
            selectionKey,
            consumption: buildConsumption(resolved),
          }),
        );
      } catch (e) {
        dispatch(dictionaryActions.resolveError({ surfaceKey, error: (e as Error).message }));
      } finally {
        inflightResolve.delete(dedupKey);
      }
    })();
    inflightResolve.set(dedupKey, p);
    return p;
  };
}

/**
 * Store-callable bridge for non-React consumers (the audio recording hooks).
 * Loads the surface-user-state, reads the stored dictionary selection
 * (surface_key → '_default' → personal-only default), then resolves + caches.
 * After awaiting this, selectDictSttPromptForSurface(surfaceKey) is populated.
 */
export function ensureDictionaryForSurfaceFromStore(surfaceKey: string): AppThunk<Promise<void>> {
  return async (dispatch, getState) => {
    await dispatch(ensureSurfaceFeatureLoaded("dictionary"));
    const feat = getState().surfaceUserState.byFeature["dictionary"];
    const rows = feat?.rows ?? {};
    const stored = (rows[surfaceKey] ?? rows[DEFAULT_SURFACE_KEY]) as Partial<DictSelection> | undefined;
    const selection: DictSelection = { ...DEFAULT_DICT_SELECTION, ...(stored ?? {}) };
    await dispatch(ensureResolved(surfaceKey, selection));
  };
}
