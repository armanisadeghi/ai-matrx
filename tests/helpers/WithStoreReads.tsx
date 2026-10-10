/**
 * A real Redux store for suites that render a component which reads through `useStoreRead`
 * (e.g. `EntityCustomFields`, drawn by every record peek) without mounting the whole app store.
 * The reducer is the app's own root reducer, so reads behave exactly as in the app.
 */
import type { ReactNode } from "react";
import { Provider } from "react-redux";
import { TooltipProvider } from "@/components/ui/tooltip";
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
  return (
    <Provider store={store}>
      <TooltipProvider>{children}</TooltipProvider>
    </Provider>
  );
}

/**
 * Wrap a React root so everything rendered through it sits under the app store. For suites that
 * render with `root.render(...)` at many sites: `const root = withAppStore(createRoot(container))`.
 */
export function withAppStore<R extends { render: (node: ReactNode) => void }>(root: R): R {
  const store = makeStoreReadsStore();
  const render = root.render.bind(root);
  root.render = (node: ReactNode) => render(<Provider store={store}><TooltipProvider>{node}</TooltipProvider></Provider>);
  return root;
}
