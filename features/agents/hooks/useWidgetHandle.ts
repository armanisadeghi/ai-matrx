/**
 * useWidgetHandle — register a widget's capability + lifecycle methods.
 *
 * A widget that wants an agent to mutate its state (replace a selection,
 * update a field, attach media, ...) calls this hook once with a WidgetHandle
 * literal. The hook registers the handle with CallbackManager and returns an
 * id to pass on `invocation.callbacks.widgetHandleId`.
 *
 * Key design choices:
 *   - The registered handle is a STABLE WRAPPER that always reads the LATEST
 *     closures off a ref. Callers can pass fresh closures every render
 *     without re-registering (no new id), and new methods added between
 *     renders (e.g. a feature flag enables `onAttachMedia` after mount) are
 *     visible immediately — `deriveClientToolsFromHandle` checks method
 *     existence at assembly time, not at registration time.
 *   - Uses `Object.defineProperty` getters to forward every known method key
 *     (10 action methods + 3 lifecycle methods) to the live ref. This is
 *     the minimum structure that satisfies both `typeof handle[key] ===
 *     "function"` checks and dynamic invocation.
 *   - Unregisters on unmount. A widget that disappears mid-stream leaves
 *     `callbackManager.get(id)` → undefined; the dispatcher treats that as
 *     `{ok:false, reason:"not_found"}` and POSTs back so the loop resumes
 *     gracefully on that result instead of hanging on one that never arrives.
 */

import { useEffect, useRef } from "react";
import { callbackManager } from "@/utils/callbackManager";
import {
  WIDGET_TOOL_NAME_TO_HANDLE_METHOD,
  type WidgetHandle,
} from "@/features/agents/types/widget-handle.types";

const LIFECYCLE_KEYS = ["onComplete", "onCancel", "onError"] as const;

/**
 * Build the stable forwarding wrapper: a handle whose every known method key
 * is a getter reading the LATEST closure off `handleRef`. Shared by both
 * hooks below so the wrapper semantics can never drift.
 */
function makeStableHandle(
  handleRef: React.RefObject<WidgetHandle | null>,
): WidgetHandle {
  const stableHandle: WidgetHandle = {};
  const allMethodKeys = [
    ...Object.values(WIDGET_TOOL_NAME_TO_HANDLE_METHOD),
    ...LIFECYCLE_KEYS,
  ] as (keyof WidgetHandle)[];

  for (const key of allMethodKeys) {
    Object.defineProperty(stableHandle, key, {
      enumerable: true,
      configurable: true,
      get() {
        const live = handleRef.current;
        const method = live?.[key];
        return typeof method === "function"
          ? (method as (...args: unknown[]) => unknown).bind(live)
          : undefined;
      },
    });
  }
  return stableHandle;
}

export function useWidgetHandle(handle: WidgetHandle): string {
  const handleRef = useRef<WidgetHandle | null>(handle);
  handleRef.current = handle;

  const idRef = useRef<string | null>(null);

  if (idRef.current === null) {
    idRef.current = callbackManager.registerWidgetHandle(
      makeStableHandle(handleRef),
    );

    if (process.env.NODE_ENV !== "production") {
      const methodCount = (
        [
          ...Object.values(WIDGET_TOOL_NAME_TO_HANDLE_METHOD),
          ...LIFECYCLE_KEYS,
        ] as (keyof WidgetHandle)[]
      ).filter((k) => typeof handle[k] === "function").length;
      if (methodCount === 0) {
        // eslint-disable-next-line no-console
        console.warn(
          "[useWidgetHandle] Handle registered with no methods — widget advertises nothing.",
        );
      }
    }
  }

  useEffect(() => {
    return () => {
      if (idRef.current) {
        callbackManager.unregister(idRef.current);
        idRef.current = null;
      }
    };
  }, []);

  // idRef.current is set synchronously above on first render (registration is
  // unconditional whenever it was still null) and is only ever cleared on
  // unmount, after which this hook can't be called again for the same handle.
  const id = idRef.current;
  if (!id) {
    throw new Error(
      "[useWidgetHandle] id was not registered — this should be unreachable.",
    );
  }
  return id;
}

/**
 * Null-tolerant variant for hosts that only SOMETIMES have a handle to offer
 * (e.g. the context-menu shell: editable surfaces expose text-edit
 * capabilities, read-only ones expose nothing). Hook order stays stable while
 * the handle's existence is conditional:
 *
 *   - `handle === null` on every render so far → nothing is registered, no id.
 *   - First non-null handle → registers the stable wrapper (same latest-closure
 *     forwarding as `useWidgetHandle`) and returns its id from then on.
 *   - Handle becomes null again later → the id stays registered but every
 *     method getter resolves undefined, so `deriveClientToolsFromHandle`
 *     advertises zero tools on the next turn — correct behavior, no churn.
 *   - Unregisters on unmount.
 */
export function useOptionalWidgetHandle(
  handle: WidgetHandle | null,
): string | null {
  const handleRef = useRef<WidgetHandle | null>(handle);
  handleRef.current = handle;

  const idRef = useRef<string | null>(null);

  if (idRef.current === null && handle !== null) {
    idRef.current = callbackManager.registerWidgetHandle(
      makeStableHandle(handleRef),
    );
  }

  useEffect(() => {
    return () => {
      if (idRef.current) {
        callbackManager.unregister(idRef.current);
        idRef.current = null;
      }
    };
  }, []);

  return idRef.current;
}
