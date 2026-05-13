// lib/redux/entity-store.ts
//
// Phase 4 — real entity store factory.
// Used exclusively by `app/EntityProviders.tsx` for routes under
// `app/(legacy)/legacy/*` that depend on the deprecated entity system.
//
// Slim routes (authenticated, public, SSR) use `makeStore` from `./store.ts`.
// These two factories are fully independent — entity imports are quarantined
// here so Turbopack can keep them out of the slim chunk graph.
//
// See `~/.claude/plans/the-entity-system-which-bubbly-wind.md`.
"use client";

import { configureStore, ThunkAction, Action } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { createEntityRootReducer } from "./entity-rootReducer";
import { createEntityRootSaga } from "./sagas/entity-rootSaga";
import { entitySagaMiddleware } from "./entity/entitySagaMiddleware";
import { loggerMiddleware } from "@/utils/logger";
import { enableMapSet } from "immer";
import { socketMiddleware } from "./socket-io/connection/socketMiddleware";
import { autoSaveMiddleware } from "@/features/notes/redux/autoSaveMiddleware";
import { codeFilesAutoSaveMiddleware } from "@/features/code-files/redux/autoSaveMiddleware";
import { cloudFilesRealtimeMiddleware } from "@/features/files";
import {
  createSyncMiddleware,
  type SyncEngineApi,
} from "@/lib/sync/engine/middleware";
import { openSyncChannel, type SyncChannel } from "@/lib/sync/channel";
import { deriveIdentity } from "@/lib/sync/identity";
import { syncPolicies } from "@/lib/sync/registry";
import type { IdentityKey } from "@/lib/sync/types";
import { mapUserData, type UserData } from "@/utils/userDataMapper";
import { getEmptyGlobalCache } from "@/utils/schema/schema-processing/emptyGlobalCache";
import type { InitialReduxState } from "@/types/reduxTypes";
import { defaultUserPreferences } from "@/lib/redux/slices/defaultPreferences";
import {
  initializeUserPreferencesState,
  UserPreferences,
  UserPreferencesState,
} from "@/lib/redux/slices/userPreferencesSlice";
import type { UserAuthState } from "@/lib/redux/slices/userAuthSlice";
import type { UserProfileState } from "@/lib/redux/slices/userProfileSlice";
import { setStoreSingleton, setRunSaga } from "./store-singleton";

interface EntityStoreSyncContext {
  channel: SyncChannel;
  identity: IdentityKey;
  getIdentity: () => IdentityKey;
  setIdentity: (next: IdentityKey) => void;
  /** Phase 5: read the engine's external API. Mirrors slim store. */
  engineApi: () => SyncEngineApi | null;
}

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

const entitySagaRunner = createSagaMiddleware();

function resolveEntityStoreBootstrapState(
  input?: Partial<InitialReduxState>,
): Record<string, unknown> {
  const baseUser = mapUserData(null, undefined, false);
  const baseSplit = splitUserData(baseUser);
  const baseUserPreferences = initializeUserPreferencesState(
    defaultUserPreferences,
    true,
  );
  const baseGlobalCache = getEmptyGlobalCache();

  if (!input) {
    return {
      userAuth: baseSplit.userAuth,
      userProfile: baseSplit.userProfile,
      userPreferences: baseUserPreferences,
      globalCache: baseGlobalCache,
    };
  }

  const mergedUser =
    input.user !== undefined
      ? ({ ...baseUser, ...input.user } as UserData)
      : baseUser;
  const split = splitUserData(mergedUser);

  const raw = input.userPreferences as Record<string, unknown> | undefined;
  let userPreferences: UserPreferencesState;
  if (input.userPreferences === undefined) {
    userPreferences = baseUserPreferences;
  } else if (raw && typeof raw === "object" && "_meta" in raw) {
    userPreferences = input.userPreferences as unknown as UserPreferencesState;
  } else {
    userPreferences = initializeUserPreferencesState(
      input.userPreferences as Partial<UserPreferences>,
      true,
    );
  }

  const out: Record<string, unknown> = {
    userAuth: split.userAuth,
    userProfile: split.userProfile,
    userPreferences,
    globalCache:
      input.globalCache !== undefined ? input.globalCache : baseGlobalCache,
  };

  if (input.contextMenuCache !== undefined) {
    out.contextMenuCache = input.contextMenuCache;
  }
  if (input.agentContextMenuCache !== undefined) {
    out.agentContextMenuCache = input.agentContextMenuCache;
  }

  return out;
}

export const makeEntityStore = (initialState?: Partial<InitialReduxState>) => {
  const resolved = resolveEntityStoreBootstrapState(initialState);
  const globalCache = resolved.globalCache as InitialReduxState["globalCache"];

  if (!globalCache?.schema) {
    throw new Error(
      "[entity-store] Schema must be provided to create entity store",
    );
  }

  const rootReducer = createEntityRootReducer({
    globalCache,
  } as InitialReduxState);

  const initialBootUserId =
    (resolved.userAuth as { id?: string | null } | undefined)?.id ?? null;
  const initialIdentity: IdentityKey = deriveIdentity({
    userId: initialBootUserId,
  });
  let currentIdentity: IdentityKey = initialIdentity;
  const syncChannel: SyncChannel = openSyncChannel(initialIdentity);
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
        entitySagaRunner,
        loggerMiddleware,
        socketMiddleware,
        syncMiddleware,
        entitySagaMiddleware,
        autoSaveMiddleware,
        codeFilesAutoSaveMiddleware,
        cloudFilesRealtimeMiddleware,
      ),
    devTools: process.env.NODE_ENV !== "production",
  });

  const syncContext: EntityStoreSyncContext = {
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

  const rootSagaInstance = createEntityRootSaga(
    resolved.globalCache
      ? ((resolved.globalCache as InitialReduxState["globalCache"])
          .entityNames ?? [])
      : [],
  );
  entitySagaRunner.run(rootSagaInstance);

  setStoreSingleton(storeWithSync);
  // Register the entity sagaMiddleware so `runSaga` (from store.ts) correctly
  // targets this store when entity reducers are injected at runtime.
  setRunSaga((saga) => entitySagaRunner.run(saga as () => any));

  return storeWithSync;
};

export type EntityAppStore = ReturnType<typeof makeEntityStore>;
export type EntityRootState = ReturnType<EntityAppStore["getState"]>;
export type EntityAppDispatch = EntityAppStore["dispatch"];
export type EntityAppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  EntityRootState,
  unknown,
  Action
>;

enableMapSet();
