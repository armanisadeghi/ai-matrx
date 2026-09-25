"use client";

// features/rich-document/variants/shared/useActionStates.ts
//
// Live toggle state for registry actions (`action.active`), re-rendering the
// renderer whenever an action's own store (`action.subscribe`) says so. One
// external-store subscription per renderer, whatever the number of actions.

import * as React from "react";
import type { RichDocumentAction, RichDocumentActionContext } from "../../types";

export function useActionStates(
  actions: RichDocumentAction[],
  ctx: RichDocumentActionContext,
): (action: RichDocumentAction) => boolean | undefined {
  const stateful = actions.filter((a) => a.active || a.subscribe);
  const subscribe = (onChange: () => void) => {
    const unsubscribers = stateful.map((a) => a.subscribe?.(onChange, ctx));
    return () => unsubscribers.forEach((u) => u?.());
  };
  // Everything a stateful action paints: on/off, its label ("Pause
  // reading"), its disabled state ("Starting…"). The string changes only
  // when one of those does, so a store notify that moves nothing visible
  // costs no render.
  const snapshot = () =>
    stateful
      .map((a) => {
        const label = typeof a.label === "function" ? a.label(ctx) : a.label;
        const disabled = a.disabled?.(ctx);
        return `${a.active?.(ctx) ? 1 : 0}|${label}|${disabled ? 1 : 0}`;
      })
      .join("\n");
  React.useSyncExternalStore(subscribe, snapshot, snapshot);
  return (action) => (action.active ? action.active(ctx) : undefined);
}
