// File: lib/redux/store.ts
// Phase 4 — slim store. No entity imports whatsoever.
// Entity-aware routes use `makeEntityStore` from `./entity-store.ts`.
"use client";

import {
  configureStore,
  ThunkAction,
  Action,
  type ThunkDispatch,
  type UnknownAction,
  type Dispatch,
} from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { createSlimRootSaga } from "@/lib/redux/sagas/rootSaga";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import type { RootState } from "@/lib/redux/rootReducer";
import { loggerMiddleware } from "@/utils/logger";
import { enableMapSet } from "immer";
import { autoSaveMiddleware } from "@/features/notes/redux/autoSaveMiddleware";
import { codeFilesAutoSaveMiddleware } from "@/features/code-files/redux/autoSaveMiddleware";
import {
  cloudFilesRealtimeMiddleware,
  cloudFilesMutationToastMiddleware,
} from "@/features/files";
import { transcriptStudioRealtimeMiddleware } from "@/features/transcript-studio/redux/realtimeMiddleware";
import { pdfStudioPersistenceMiddleware } from "@/features/pdf-extractor/state/persistence";
import { agentCacheBustMiddleware } from "@/features/agents/redux/agent-definition/cache-bust-middleware";
import { scopeTreeInvalidationMiddleware } from "@/features/scopes/redux/scopeTreeInvalidationMiddleware";
import { overlayRenderWatchdogMiddleware } from "@/features/window-panels/diagnostics/overlayRenderWatchdog";
import {
  createSyncMiddleware,
  type SyncEngineApi,
} from "@/lib/sync/engine/middleware";
import { openSyncChannel, type SyncChannel } from "@/lib/sync/channel";
import { deriveIdentity } from "@/lib/sync/identity";
import { syncPolicies } from "@/lib/sync/registry";
import type { IdentityKey } from "@/lib/sync/types";
import { mapUserData, type UserData } from "@/utils/userDataMapper";
import type { BaseReduxState } from "@/types/reduxTypes";
import { defaultUserPreferences } from "@/lib/redux/preferences/defaultUserPreferences";
import { initializeUserPreferencesState } from "@/lib/redux/preferences/userPreferencesSlice";
import type {
  UserPreferences,
  UserPreferencesState,
} from "@/lib/redux/preferences/userPreferencesSlice";
import type { UserAuthState } from "@/lib/redux/slices/userAuthSlice";
import type { UserProfileState } from "@/lib/redux/slices/userProfileSlice";
import {
  setStoreSingleton,
  setRunSaga,
  runSagaViaRegistry,
} from "./store-singleton";

/**
 * Splits a flat `UserData` wire shape into the two slice preloaded states.
 * Server layouts keep passing `initialReduxState.user = mapUserData(...)`;
 * the store partitions it into `userAuth` + `userProfile` here.
 */
function splitUserData(user: UserData): {
  userAuth: UserAuthState;
  userProfile: UserProfileState;
} {
  return {
    userAuth: {
      id: user.id,
      email: user.email,
      phone: user.phone,
      emailConfirmedAt: user.emailConfirmedAt,
      lastSignInAt: user.lastSignInAt,
      appMetadata: user.appMetadata,
      identities: user.identities,
      isAdmin: user.isAdmin,
      adminLevel: user.adminLevel,
      accessToken: user.accessToken,
      tokenExpiresAt: null,
      authReady: user.id !== null,
    },
    userProfile: {
      userMetadata: user.userMetadata,
      fingerprintId: null,
      shellDataLoaded: false,
    },
  };
}

const sagaMiddleware = createSagaMiddleware();

/**
 * Sync engine context attached to the store as `_sync`. Consumed by
 * `StoreProvider` to drive `bootSync` without double-opening the channel.
 *
 * Phase 5 adds `engineApi` — a getter for the engine's external API
 * (isPendingEcho + flushAutoSave). Consumers (notes realtime middleware,
 * window panels' visibility-flush handler) read from here.
 */
export interface StoreSyncContext {
  channel: SyncChannel;
  identity: IdentityKey;
  getIdentity: () => IdentityKey;
  setIdentity: (next: IdentityKey) => void;
  /** Phase 5: read the engine's external API. Null until middleware constructs. */
  engineApi: () => SyncEngineApi | null;
}

function resolveUserPreferencesForBootstrap(
  input: Partial<BaseReduxState>,
  base: { userPreferences: UserPreferencesState },
): UserPreferencesState {
  if (input.userPreferences === undefined) {
    return base.userPreferences;
  }
  const raw = input.userPreferences as Record<string, unknown>;
  if (raw && typeof raw === "object" && "_meta" in raw) {
    return input.userPreferences as unknown as UserPreferencesState;
  }
  return initializeUserPreferencesState(
    input.userPreferences as Partial<UserPreferences>,
    true,
  );
}

/**
 * Builds slim preloaded state from optional partial bootstrap data.
 * Does NOT include `globalCache` — the slim store has no entity reducers.
 *
 * `modelRegistry` and the SMS unread total are NOT preloaded here.
 * `modelRegistry` hydrates via `SsrShellHydrator` (action-based) and
 * SMS counts via `PostPaintHydrator` dispatch.
 */
export function resolveStoreBootstrapState(
  input?: Partial<BaseReduxState>,
): Record<string, unknown> {
  const baseUser = mapUserData(null, undefined, false);
  const baseSplit = splitUserData(baseUser);
  const baseUserPreferences = initializeUserPreferencesState(
    defaultUserPreferences,
    true,
  );

  if (!input) {
    return {
      userAuth: baseSplit.userAuth,
      userProfile: baseSplit.userProfile,
      userPreferences: baseUserPreferences,
    };
  }

  const mergedUser =
    input.user !== undefined
      ? ({ ...baseUser, ...input.user } as UserData)
      : baseUser;
  const split = splitUserData(mergedUser);

  const out: Record<string, unknown> = {
    userAuth: split.userAuth,
    userProfile: split.userProfile,
    userPreferences: resolveUserPreferencesForBootstrap(input, {
      userPreferences: baseUserPreferences,
    }),
  };

  if (input.contextMenuCache !== undefined) {
    out.contextMenuCache = input.contextMenuCache;
  }
  if (input.agentContextMenuCache !== undefined) {
    out.agentContextMenuCache = input.agentContextMenuCache;
  }

  return out;
}

export const makeStore = (initialState?: Partial<BaseReduxState>) => {
  const resolved = resolveStoreBootstrapState(initialState);
  const rootReducer = createSlimRootReducer();

  const initialBootUserId =
    (resolved.userAuth as { id?: string | null } | undefined)?.id ?? null;
  const initialIdentity: IdentityKey = deriveIdentity({
    userId: initialBootUserId,
  });
  let currentIdentity: IdentityKey = initialIdentity;
  const syncChannel: SyncChannel = openSyncChannel(initialIdentity);
  // Phase 5: mutable holder for the engine API (isPendingEcho + flushAutoSave).
  // Populated by `createSyncMiddleware` inside its closure; read by the
  // `StoreSyncContext.engineApi()` getter below.
  const engineApiRef: { current: SyncEngineApi | null } = { current: null };
  const syncMiddleware = createSyncMiddleware({
    policies: syncPolicies,
    channel: syncChannel,
    getIdentity: () => currentIdentity,
    apiRef: engineApiRef,
  });

  const store = configureStore({
    reducer: rootReducer,
    preloadedState: resolved as unknown as Parameters<
      typeof configureStore
    >[0]["preloadedState"],
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: false,
        immutableCheck: false,
        actionCreatorCheck: false,
      }).concat(
        sagaMiddleware,
        loggerMiddleware,
        syncMiddleware,
        autoSaveMiddleware,
        codeFilesAutoSaveMiddleware,
        cloudFilesRealtimeMiddleware,
        cloudFilesMutationToastMiddleware,
        transcriptStudioRealtimeMiddleware,
        pdfStudioPersistenceMiddleware,
        agentCacheBustMiddleware,
        scopeTreeInvalidationMiddleware,
        overlayRenderWatchdogMiddleware,
      ),
    devTools: process.env.NODE_ENV !== "production",
  });

  const syncContext: StoreSyncContext = {
    channel: syncChannel,
    identity: initialIdentity,
    getIdentity: () => currentIdentity,
    setIdentity: (next: IdentityKey) => {
      currentIdentity = next;
      syncChannel.setIdentity(next);
      syncContext.identity = next;
    },
    engineApi: () => engineApiRef.current,
  };
  const storeWithSync = Object.assign(store, { _sync: syncContext });

  const rootSagaInstance = createSlimRootSaga();
  sagaMiddleware.run(rootSagaInstance);

  setStoreSingleton(storeWithSync);
  // Register this store's sagaMiddleware so `runSaga` from this module
  // (and any consumer that imports it) always runs on the active store.
  setRunSaga((saga) => sagaMiddleware.run(saga as () => any));

  return storeWithSync;
};

export type AppStore = ReturnType<typeof makeStore>;
// RootState is derived from the root reducer (see rootReducer.ts), NOT from
// `AppStore["getState"]`. Routing it through the store instance creates a type
// cycle once `AppDispatch` references `RootState`: AppStore -> makeStore body
// (which references RootState/AppDispatch) -> RootState -> AppStore. The
// reducer-derived type is structurally identical for the slim store and breaks
// the loop so `AppDispatch` below can safely reference it.
export type { RootState };
// Explicit dispatch type rather than the inferred `AppStore["dispatch"]`.
// Under `strictFunctionTypes`, TS checks the thunk middleware's function-typed
// parameter contravariantly, which collapses the inferred store dispatch down to
// the plain-action overload — so `dispatch(someThunk())` everywhere fails with
// TS2769 ("AsyncThunkAction is not assignable to UnknownAction"). Declaring the
// canonical `ThunkDispatch & Dispatch` intersection (the same shape every local
// `ThunkApi.dispatch` fix uses) keeps the thunk overload intact app-wide.
export type AppDispatch = ThunkDispatch<RootState, unknown, UnknownAction> &
  Dispatch<UnknownAction>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action
>;

/**
 * Run an additional saga on whichever store's sagaMiddleware is currently
 * active. Delegates to the registry so entity routes correctly use the
 * entity store's sagaMiddleware even though this module is imported by
 * `injectEntityReducers`.
 */
export function runSaga(saga: () => Generator): void {
  runSagaViaRegistry(saga);
}

// Re-export `getStore` from the leaf singleton so existing callers don't
// need to change their import paths.
export { getStoreSingleton as getStore } from "./store-singleton";

enableMapSet();
