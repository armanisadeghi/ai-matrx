/**
 * test-utils/store-reads.tsx — a Redux store with the `storeReads` slice, for a
 * suite that renders a view whose reads are kept in the store
 * (`lib/redux/store-reads/useStoreRead.ts`). A fresh store per call: two
 * renders that share one store share their answers, exactly as two views of one
 * record do in the app.
 */
import * as React from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import storeReadsReducer from "@/lib/redux/slices/storeReadsSlice";

export function makeStoreReadsStore() {
  return configureStore({ reducer: { storeReads: storeReadsReducer } });
}

/** A `renderHook` wrapper / tree root that carries one fresh store. */
export function storeReadsWrapper(store = makeStoreReadsStore()) {
  return function StoreReadsWrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}
