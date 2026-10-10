/**
 * A real Redux store for suites that render a component which reads through `useStoreRead`
 * (e.g. `EntityCustomFields`, drawn by every record peek) without mounting the whole app store.
 * The reducer is the app's own root reducer, so reads behave exactly as in the app.
 */
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";

export function makeStoreReadsStore() {
  return configureStore({
    reducer: createSlimRootReducer() as never,
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
  });
}

export function WithStoreReads({ children }: { children: ReactNode }) {
  const store = makeStoreReadsStore();
  return <Provider store={store}>{children}</Provider>;
}
