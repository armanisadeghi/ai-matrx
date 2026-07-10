import {
  createSlice,
  createAsyncThunk,
  createSelector,
} from "@reduxjs/toolkit";
import { createClient } from "@/utils/supabase/client";
import { normalizeModel } from "@/features/ai-models/utils/model-normalizer";
// Minimal local state type — avoids importing RootState from store.ts (which
// transitively imports this slice via reduxTypes → modelRegistrySlice),
// breaking the type-level circular dependency.
type StateWithModelRegistry = { modelRegistry: ModelRegistryState };
import type { Database } from "@/types/database.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Full row shape from the `ai.model_definition` table — always in sync with the DB. */
export type AIModelRow = Database["ai"]["Tables"]["model_definition"]["Row"];

/**
 * What data this record currently holds.
 *
 * - 'options' → only id, name, common_name, maker, model_class loaded
 * - 'full'    → all columns loaded
 *
 * Status only upgrades — never downgrades. A 'full' record never becomes 'options'.
 */
export type ModelRecordFetchType = "options" | "full";

/**
 * Per-record shape stored in the registry.
 * Always has the options fields; full fields are present only when fetchType === 'full'.
 */
export type AIModelRecord = {
  _fetchType: ModelRecordFetchType;
  /** Resolved brand/maker name (`ai.provider.name` via the `provider_id` FK).
   *  Not a stored column — attached by the fetch/hydrate layer. Replaced the
   *  dropped free-text `provider` column for all display. */
  maker: string | null;
  // `api_class`/`model_class` still exist on ai.model_definition (dropping in a
  // later phase) but the registry never surfaces them — routing is decided
  // server-side via ai.offering → ai.endpoint/ai.api.
} & Omit<AIModelRow, "api_class" | "model_class">;

/** Convenience alias — the full normalized model (fetchType === 'full'). */
export type AIModel = AIModelRecord;

/**
 * What scope of model IDs the registry covers.
 *
 * - null         → nothing fetched yet
 * - 'active'     → active model IDs are known (is_deprecated !== true)
 * - 'deprecated' → deprecated model IDs are known
 * - 'all'        → all model IDs are known
 *
 * Scope only tracks which IDs we know about, not how much data each has.
 */
export type ModelFetchScope = "active" | "deprecated" | "all" | null;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface ModelRegistryState {
  /** Normalized entity map: id → AIModelRecord */
  entities: Record<string, AIModelRecord>;
  /** Ordered list of active (non-deprecated) model IDs for stable ordering */
  activeIds: string[];
  /** Ordered list of deprecated model IDs */
  deprecatedIds: string[];
  /** Which IDs we know about in total */
  fetchScope: ModelFetchScope;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;
}

const initialState: ModelRegistryState = {
  entities: {},
  activeIds: [],
  deprecatedIds: [],
  fetchScope: null,
  isLoading: false,
  error: null,
  lastFetched: null,
};

// ---------------------------------------------------------------------------
// Minimal options shape returned by the options query
// ---------------------------------------------------------------------------

// Sourced from the ai.model_public view, which resolves the maker name from the
// provider_id FK (the dropped free-text `provider` column is never read).
// The view's columns are all nullable; the thunk normalizes id/name before use.
type ModelOptionRow = {
  id: string;
  name: string;
  common_name: string | null;
  maker: string | null;
  cost_rating: number | null;
  speed_rating: number | null;
};

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

/**
 * Fetch lightweight options (id, name, common_name, maker) for
 * all active, ROUTABLE models. Used to populate dropdowns without pulling the full schema.
 *
 * CRITICAL: only models with ≥1 available ai.offering are returned. A bare
 * model_definition row is NOT callable — resolve_call_profile raises. Listing
 * orphans here is how grok-4.5 looked "set up fine" while every call failed.
 *
 * Each fetched record is stored with _fetchType:'options'.
 * Records already marked 'full' are not downgraded.
 *
 * Skips entirely when active IDs are already known.
 */
export const fetchModelOptions = createAsyncThunk(
  "modelRegistry/fetchModelOptions",
  async (_, { rejectWithValue }) => {
    try {
      const supabase = createClient();
      // model_offering is the user-facing join of available offerings × active
      // services × non-deprecated models — if a model isn't here, it cannot route.
      const { data: offeringRows, error: offeringError } = await supabase
        .schema("ai")
        .from("model_offering")
        .select("model_id");
      if (offeringError) throw offeringError;
      const routableIds = [
        ...new Set(
          (offeringRows ?? [])
            .map((r) => r.model_id)
            .filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
        ),
      ];
      if (routableIds.length === 0) {
        return [] as ModelOptionRow[];
      }
      // ai.model_public already excludes deprecated/deleted models and resolves
      // the maker name from the provider_id FK. Constrain to routable IDs.
      const { data, error } = await supabase
        .schema("ai")
        .from("model_public")
        .select("id, name, common_name, maker, cost_rating, speed_rating")
        .in("id", routableIds)
        .order("common_name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? [])
        .filter(
          (r): r is typeof r & { id: string; name: string } =>
            typeof r.id === "string" && typeof r.name === "string",
        )
        .map(
          (r): ModelOptionRow => ({
            id: r.id,
            name: r.name,
            common_name: r.common_name,
            maker: r.maker,
            cost_rating: r.cost_rating,
            speed_rating: r.speed_rating,
          }),
        );
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  },
  {
    condition: (_, { getState }) => {
      const { fetchScope, isLoading } = (
        getState() as { modelRegistry: ModelRegistryState }
      ).modelRegistry;
      const shouldFetch =
        fetchScope !== "active" && fetchScope !== "all" && !isLoading;
      if (!shouldFetch) {
        // console.log(
        //   "[modelRegistry] fetchModelOptions skipped — already loaded (fetchScope:",
        //   fetchScope,
        //   ")",
        // );
      }
      return shouldFetch;
    },
  },
);

/**
 * Fetch the full record for a single model by ID.
 *
 * Reads the ai.model_config RESOLUTION view (Phase D of the AI catalog
 * migration): `controls` and `constraints` are computed live from
 * ai.api.rules ⊕ ai.offering.override × ai.setting for the model's preferred
 * offering — the legacy model_definition.controls/constraints columns are
 * dead to the app and drop in Phase C. The view also carries every display
 * field the registry consumes (maker, ratings, premium flag, context window,
 * capabilities), so this stays ONE read.
 *
 * Skips when the record is already marked 'full'.
 * Always runs if the record is only 'options' or unknown.
 */
export const fetchModelById = createAsyncThunk(
  "modelRegistry/fetchModelById",
  async (modelId: string, { rejectWithValue }) => {
    console.log(
      "[modelRegistry] fetchModelById — fetching full record for",
      modelId,
    );
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .schema("ai")
        .from("model_config")
        .select("*")
        .eq("id", modelId)
        .single();
      if (error) throw error;
      if (!data.id || !data.name) {
        throw new Error(
          `ai.model_config returned a row without id/name for model ${modelId}`,
        );
      }
      // normalizeModel keeps the legacy-alias mapping (output_format →
      // response_format for image models) — the resolver emits the
      // provider-canonical key names.
      return normalizeModel({
        id: data.id,
        name: data.name,
        common_name: data.common_name,
        maker: data.maker,
        cost_rating: data.cost_rating,
        speed_rating: data.speed_rating,
        is_premium: data.is_premium,
        is_primary: data.is_primary,
        context_window: data.context_window,
        max_tokens: data.max_tokens,
        capabilities: data.capabilities,
        controls: data.controls,
        constraints: data.constraints,
      });
    } catch (err: unknown) {
      return rejectWithValue(
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  },
  {
    condition: (modelId: string, { getState }) => {
      const { entities, isLoading } = (
        getState() as { modelRegistry: ModelRegistryState }
      ).modelRegistry;
      const existing = entities[modelId];
      if (isLoading) return false; // a fetch is already in flight
      if (existing?._fetchType === "full") {
        console.log(
          "[modelRegistry] fetchModelById skipped — already full for",
          modelId,
        );
        return false;
      }
      return true;
    },
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const modelRegistrySlice = createSlice({
  name: "modelRegistry",
  initialState,
  reducers: {
    /**
     * SSR hydration path.
     * Supply options-level or full records from the server shell.
     * fetchType tells the slice how much data each record carries.
     */
    hydrateModels(
      state,
      action: {
        payload: {
          // The SSR shell attaches the resolved `maker` (ai.provider.name); the
          // dropping columns may still be present at runtime but are never read.
          models: AIModelRecord[];
          fetchType: ModelRecordFetchType;
          fetchScope: ModelFetchScope;
          lastFetched: number;
        };
      },
    ) {
      const { models, fetchType, fetchScope, lastFetched } = action.payload;
      for (const raw of models) {
        const id = raw.id;
        const existing = state.entities[id];
        // Never downgrade a full record to options
        if (existing?._fetchType === "full" && fetchType === "options")
          continue;
        state.entities[id] = {
          ...emptyModelRecord(),
          ...normalizeModel(raw),
          _fetchType: fetchType,
        };
      }
      // Rebuild ID lists
      rebuildIdLists(state);
      state.fetchScope = fetchScope;
      state.lastFetched = lastFetched;
      state.isLoading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // ── fetchModelOptions ──────────────────────────────────────────
    builder
      .addCase(fetchModelOptions.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchModelOptions.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        for (const row of action.payload) {
          const existing = state.entities[row.id];
          // Never downgrade full to options
          if (existing?._fetchType === "full") continue;
          state.entities[row.id] = {
            // Spread a skeleton so all AIModelRow fields exist (null for unfetched ones)
            ...emptyModelRecord(),
            ...existing,
            ...row,
            _fetchType: "options",
          };
        }
        rebuildIdLists(state);
        if (state.fetchScope !== "all" && state.fetchScope !== "deprecated") {
          state.fetchScope = "active";
        }
        state.lastFetched = Date.now();
      })
      .addCase(fetchModelOptions.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // ── fetchModelById ─────────────────────────────────────────────
    builder
      .addCase(fetchModelById.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchModelById.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        const record = action.payload;
        const existing = state.entities[record.id];
        // ai.model_config resolves `maker` itself; fall back to whatever the
        // options fetch attached if the view ever returns null.
        state.entities[record.id] = {
          ...emptyModelRecord(),
          ...existing,
          ...record,
          maker: record.maker ?? existing?.maker ?? null,
          _fetchType: "full",
        };
        // Ensure the id appears in the right list
        rebuildIdLists(state);
      })
      .addCase(fetchModelById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** A skeleton record with all AIModelRow fields set to null/defaults. */
function emptyModelRecord(): Omit<AIModelRecord, "_fetchType"> {
  return {
    id: "",
    name: "",
    common_name: null,
    maker: null,
    capabilities: null,
    constraints: [],
    context_window: null,
    controls: null,
    is_deprecated: null,
    is_premium: null,
    is_primary: null,
    max_tokens: null,
    provider_id: null,
    guest_fallback_id: null,
    mid_fallback_id: null,
    // 2026-07-10 ai-schema reshape additions
    cost_rating: null,
    speed_rating: null,
    retry_fallback_id: null,
    retry_max_attempts: 0,
    organization_id: "",
    created_by: null,
    deleted_at: null,
    visibility: "private",
    // Canonical base columns (2026-07-02 AI-catalog reshape)
    is_system: false,
    created_at: "",
    updated_at: "",
    updated_by: null,
    version: 0,
    metadata: {},
    description: null,
    release_date: null,
  };
}

/** Rebuild activeIds and deprecatedIds from current entities. */
function rebuildIdLists(state: ModelRegistryState): void {
  const active: string[] = [];
  const deprecated: string[] = [];
  for (const [id, record] of Object.entries(state.entities)) {
    if (record.is_deprecated === true) {
      deprecated.push(id);
    } else {
      active.push(id);
    }
  }
  // Sort by common_name for stable ordering
  const sort = (ids: string[]) =>
    ids.sort((a, b) =>
      (
        state.entities[a].common_name ??
        state.entities[a].name ??
        ""
      ).localeCompare(
        state.entities[b].common_name ?? state.entities[b].name ?? "",
      ),
    );
  state.activeIds = sort(active);
  state.deprecatedIds = sort(deprecated);
}

export const { hydrateModels } = modelRegistrySlice.actions;
export default modelRegistrySlice.reducer;

// ---------------------------------------------------------------------------
// Base selectors — plain lookups only, no transformation (Rule 4)
// ---------------------------------------------------------------------------

const selectRegistrySlice = (state: StateWithModelRegistry) =>
  state.modelRegistry;
const selectEntities = (state: StateWithModelRegistry) =>
  state.modelRegistry.entities;
const selectActiveIds = (state: StateWithModelRegistry) =>
  state.modelRegistry.activeIds;
const selectDeprecatedIds = (state: StateWithModelRegistry) =>
  state.modelRegistry.deprecatedIds;

export const selectModelFetchScope = (state: StateWithModelRegistry) =>
  state.modelRegistry.fetchScope;
export const selectModelRegistryLoading = (state: StateWithModelRegistry) =>
  state.modelRegistry.isLoading;
export const selectModelRegistryError = (state: StateWithModelRegistry) =>
  state.modelRegistry.error;
export const selectModelRegistryLastFetched = (state: StateWithModelRegistry) =>
  state.modelRegistry.lastFetched;

// ---------------------------------------------------------------------------
// Derived selectors (Rule 4 — extract in inputs, transform in result)
// ---------------------------------------------------------------------------

/**
 * Ordered array of active model records (whatever data level each has).
 * Safe to call before options are loaded — returns empty array.
 */
export const selectActiveModels = createSelector(
  [selectEntities, selectActiveIds],
  (entities, ids): AIModelRecord[] =>
    ids.map((id) => entities[id]).filter(Boolean),
);

/**
 * Ordered array of deprecated model records.
 */
export const selectDeprecatedModels = createSelector(
  [selectEntities, selectDeprecatedIds],
  (entities, ids): AIModelRecord[] =>
    ids.map((id) => entities[id]).filter(Boolean),
);

/**
 * All known model records regardless of deprecation.
 */
export const selectAllModels = createSelector(
  [selectEntities],
  (entities): AIModelRecord[] => Object.values(entities),
);

/**
 * Active models as dropdown options — { value, label, maker }.
 * Only requires fetchType:'options' data — works immediately after fetchModelOptions.
 */
export const selectModelOptions = createSelector(
  [selectActiveModels],
  (models) =>
    models.map((m) => ({
      value: m.id,
      label: m.common_name || m.name || m.id,
      maker: m.maker,
      costRating: m.cost_rating,
      speedRating: m.speed_rating,
    })),
);

/**
 * All models (active + deprecated) as dropdown options — for admin tooling.
 */
export const selectAllModelOptions = createSelector(
  [selectEntities],
  (entities) =>
    Object.values(entities).map((m) => ({
      value: m.id,
      label: m.common_name || m.name || m.id,
      maker: m.maker,
      isDeprecated: m.is_deprecated ?? false,
    })),
);

/**
 * Display label for a model ID. Works as soon as options are loaded.
 * Returns undefined when not found.
 */
export const selectModelLabelById = createSelector(
  [
    selectEntities,
    (_state: StateWithModelRegistry, modelId: string | null | undefined) =>
      modelId,
  ],
  (entities, modelId): string | undefined => {
    if (!modelId) return undefined;
    const m = entities[modelId];
    if (!m) return undefined;
    return m.common_name || m.name || m.id;
  },
);

/**
 * Raw model name (the `name` column) for a model ID.
 * Returns a primitive string or undefined — safe for direct useAppSelector.
 */
export const selectModelNameById = createSelector(
  [
    selectEntities,
    (_state: StateWithModelRegistry, modelId: string | null | undefined) =>
      modelId,
  ],
  (entities, modelId): string | undefined => {
    if (!modelId) return undefined;
    return entities[modelId]?.name;
  },
);

/**
 * Full record for a single model ID. Returns undefined until fetchModelById completes.
 * Returns the record regardless of fetchType — callers should check _fetchType if they
 * need to know whether full data is present.
 *
 * NOTE: cache size 1 — use makeSelectModelById factory when multiple instances
 * subscribe to different IDs simultaneously.
 */
export const selectModelById = createSelector(
  [
    selectEntities,
    (_state: StateWithModelRegistry, modelId: string) => modelId,
  ],
  (entities, modelId): AIModelRecord | undefined => entities[modelId],
);

/**
 * Factory for per-instance memoized selectModelById.
 *
 * @example
 *   const selectModel = useMemo(makeSelectModelById, []);
 *   const model = useAppSelector(state => selectModel(state, modelId));
 */
export const makeSelectModelById = () =>
  createSelector(
    [
      selectEntities,
      (_state: StateWithModelRegistry, modelId: string) => modelId,
    ],
    (entities, modelId): AIModelRecord | undefined => entities[modelId],
  );

/**
 * Controls blob for a model. Undefined when record not found or not yet fetched.
 */
export const selectModelControls = createSelector(
  [
    selectEntities,
    (_state: StateWithModelRegistry, modelId: string) => modelId,
  ],
  (entities, modelId) => entities[modelId]?.controls,
);

/**
 * fetchType for a single model — 'options', 'full', or undefined if unknown.
 */
export const selectModelFetchType = createSelector(
  [
    selectEntities,
    (_state: StateWithModelRegistry, modelId: string) => modelId,
  ],
  (entities, modelId): ModelRecordFetchType | undefined =>
    entities[modelId]?._fetchType,
);

// ---------------------------------------------------------------------------
// Readiness selectors — one boolean per UI use case
// ---------------------------------------------------------------------------

/** True once active model options are available for dropdown rendering. */
export const selectActiveModelsReady = createSelector(
  [selectRegistrySlice],
  ({ fetchScope, activeIds }): boolean =>
    (fetchScope === "active" || fetchScope === "all") && activeIds.length > 0,
);

/** True once deprecated model IDs are known. */
export const selectDeprecatedModelsReady = createSelector(
  [selectRegistrySlice],
  ({ fetchScope, deprecatedIds }): boolean =>
    (fetchScope === "deprecated" || fetchScope === "all") &&
    deprecatedIds.length > 0,
);

/** True once all model IDs (active + deprecated) are known. */
export const selectAllModelsReady = createSelector(
  [selectRegistrySlice],
  ({ fetchScope }): boolean => fetchScope === "all",
);

/**
 * True when a specific model has its full record loaded.
 * Use to gate components that need controls, context_window, etc.
 */
export const selectModelFullyLoaded = createSelector(
  [
    selectEntities,
    (_state: StateWithModelRegistry, modelId: string | null | undefined) =>
      modelId,
  ],
  (entities, modelId): boolean => {
    if (!modelId) return false;
    return entities[modelId]?._fetchType === "full";
  },
);

