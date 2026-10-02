// packages/chat/src/store/hooks.ts
//
// The package's typed Redux hooks (PACKAGE-INDEPENDENCE.md §2.2, P3). They read the chat store
// from the package's own `ChatStoreContext`, which `<ChatProvider>` mounts — the host's store
// when injected (matrx-frontend), a private one otherwise (extend, local, any bare host).
//
// TRANSITION (until P29d): with no `ChatStoreContext` above, they fall back to react-redux's
// default context — a package component rendered under a plain `<Provider store>` (a second
// React root, a test) keeps working — and say so once in the console. P29d removes the fallback
// (`hooks-require-chat-store-context.test.tsx`).
//
// `useAppSelector` / `useAppDispatch` / `useAppStore` are the seam names the package's call
// sites (and their `jest.mock` factories) already use; the store codemod only rewrote the import
// specifier. They ARE the chat hooks.

"use client";

import { useContext } from "react";
import {
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
  useDispatch,
  useSelector,
  useStore,
  type UseDispatch,
  type UseSelector,
  type UseStore,
} from "react-redux";
import { ChatStoreContext } from "./context";
import type { ChatAppStore, ChatDispatch, ChatRootState } from "./root-state";
import { announceOnce } from "../host/errors";

const selectFromChatStore = createSelectorHook(ChatStoreContext);
const dispatchFromChatStore = createDispatchHook(ChatStoreContext);
const storeFromChatStore = createStoreHook(ChatStoreContext);

/**
 * True when a `<ChatProvider>` mounted the chat store above. When false, announces the
 * transition fallback once. Which store a component reads is fixed by where it is mounted, so
 * the hook a component calls below never changes between its renders.
 */
function useHasChatStore(): boolean {
  const mounted = useContext(ChatStoreContext) !== null;
  if (!mounted) {
    announceOnce(
      "store-context-fallback",
      "A chat component rendered outside <ChatProvider>; it is reading the nearest react-redux " +
        "store instead. Render it inside <ChatProvider> (pass `store` to share the app's store).",
      "info",
    );
  }
  return mounted;
}

function useChatSelectorImpl<Selected>(
  selector: (state: ChatRootState) => Selected,
  equalityFnOrOptions?: Parameters<UseSelector<ChatRootState>>[1],
): Selected {
  "use no memo";
  const useSelectorHook = useHasChatStore() ? selectFromChatStore : useSelector;
  return useSelectorHook(selector, equalityFnOrOptions as never) as Selected;
}

function useChatDispatchImpl(): ChatDispatch {
  "use no memo";
  const useDispatchHook = useHasChatStore() ? dispatchFromChatStore : useDispatch;
  return useDispatchHook() as ChatDispatch;
}

function useChatStoreImpl(): ChatAppStore {
  "use no memo";
  const useStoreHook = useHasChatStore() ? storeFromChatStore : useStore;
  return useStoreHook() as unknown as ChatAppStore;
}

/** Select from the chat store. */
export const useChatSelector = Object.assign(useChatSelectorImpl, {
  withTypes: () => useChatSelector,
}) as unknown as UseSelector<ChatRootState>;

/** The chat store's thunk-aware dispatch. */
export const useChatDispatch = Object.assign(useChatDispatchImpl, {
  withTypes: () => useChatDispatch,
}) as unknown as UseDispatch<ChatDispatch>;

/** The chat store itself (for `getState()` inside callbacks). */
export const useChatStore = Object.assign(useChatStoreImpl, {
  withTypes: () => useChatStore,
}) as unknown as UseStore<ChatAppStore>;

// Seam names — identical to the chat hooks above.
export const useAppSelector = useChatSelector;
export const useAppDispatch = useChatDispatch;
export const useAppStore = useChatStore;
