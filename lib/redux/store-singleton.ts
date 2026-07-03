// lib/redux/store-singleton.ts
//
// Pure leaf module holding the runtime store reference. Both store factories
// (`makeStore` in `./store.ts` and `makeEntityStore` in `./entity-store.ts`)
// call `setStoreSingleton()` after building the store. Consumers (utility
// modules that need to read state from outside React) call
// `getStoreSingleton()`.
//
// CRITICAL: this file imports NOTHING from the project at all — not even
// type-only imports. That's the whole point — utilities that previously
// imported `getStore` from `@/lib/redux/store` dragged the entire
// reducer/middleware/saga graph into the consumer's chunk and produced TDZ
// cycles. Routing through this leaf module breaks all those cycles.
//
// AppStore is defined structurally below (no import needed) and is
// compatible with the actual EnhancedStore via TypeScript structural typing.
//
// See `~/.claude/plans/the-entity-system-which-bubbly-wind.md`.

// Import ONLY from external packages — never from the project — to keep this
// module cycle-free. EnhancedStore<any,any,any> is structurally compatible
// with the actual concrete store; callers cast getState() as needed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { EnhancedStore } from "@reduxjs/toolkit";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppStore = EnhancedStore<any, any, any>;

let storeInstance: AppStore | null = null;

export function setStoreSingleton(store: AppStore): void {
  storeInstance = store;
}

export function getStoreSingleton(): AppStore | null {
  return storeInstance;
}

/**
 * @deprecated Migration alias for callers that previously imported
 * `getStore` from `@/lib/redux/store`. Use `getStoreSingleton`. The alias
 * preserves source-compat while we migrate call sites.
 */
export const getStore = getStoreSingleton;

// ---------------------------------------------------------------------------
// Saga runner registry — allows `runSaga` from `store.ts` to always invoke
// whichever store's sagaMiddleware is currently active (slim OR entity).
// Both `makeStore` and `makeEntityStore` call `setRunSaga` after construction.
// ---------------------------------------------------------------------------
type SagaRunner = (saga: () => Generator) => void;

let runSagaFn: SagaRunner | null = null;

export function setRunSaga(fn: SagaRunner): void {
  runSagaFn = fn;
}

export function runSagaViaRegistry(saga: () => Generator): void {
  if (runSagaFn) {
    runSagaFn(saga);
  } else {
    console.warn(
      "[store-singleton] runSaga called before a store was initialized",
    );
  }
}
