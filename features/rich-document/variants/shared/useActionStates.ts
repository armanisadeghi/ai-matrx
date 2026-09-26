"use client";

// features/rich-document/variants/shared/useActionStates.ts
//
// Live toggle state for registry actions (`active`, a function `label`,
// `disabled`, `stateIcon`), re-rendering the renderer whenever an action's own
// store (`action.subscribe`) says so. One external-store subscription per
// renderer, whatever the number of actions.
//
// 🚨 React Compiler is on. Everything a stateful action paints MUST be read
// through the reader this returns, and this hook is `"use no memo"` so that
// reader is a new function each render. Reading `action.label(ctx)` directly
// in render — cached by the compiler on (action, ctx) alone — never updates:
// that is how the read-aloud button kept its speaker icon while audio played
// (seen live 2026-09-25).

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { resolveActionLabel } from "../../actions/utils";
import type { RichDocumentAction, RichDocumentActionContext } from "../../types";

export interface ActionLiveState {
  /** undefined when the action is not a toggle. */
  active: boolean | undefined;
  label: string;
  disabled: boolean;
  disabledReason?: string;
  icon: LucideIcon;
  spin: boolean;
}

export function useActionStates(
  actions: RichDocumentAction[],
  ctx: RichDocumentActionContext,
): (action: RichDocumentAction) => ActionLiveState {
  // Opted out of the compiler: the returned reader must be a NEW function on
  // every render so callers recompute what they paint when the store moves.
  "use no memo";
  const stateful = actions.filter((a) => a.active || a.subscribe);
  const subscribe = (onChange: () => void) => {
    const unsubscribers = stateful.map((a) => a.subscribe?.(onChange, ctx));
    return () => unsubscribers.forEach((u) => u?.());
  };
  // Everything a stateful action paints: on/off, its label ("Pause
  // reading"), its disabled state ("Starting…"), its live glyph. The string
  // changes only when one of those does, so a store notify that moves
  // nothing visible costs no render.
  const snapshot = () =>
    stateful
      .map((a) => {
        const label = typeof a.label === "function" ? a.label(ctx) : a.label;
        const disabled = a.disabled?.(ctx);
        const live = a.stateIcon?.(ctx);
        return `${a.active?.(ctx) ? 1 : 0}|${label}|${disabled ? 1 : 0}|${live?.icon.displayName ?? ""}${live?.spin ? "~" : ""}`;
      })
      .join("\n");
  React.useSyncExternalStore(subscribe, snapshot, snapshot);

  return (action) => {
    const disabledResult = action.disabled?.(ctx);
    const live = action.stateIcon?.(ctx) ?? null;
    return {
      active: action.active ? action.active(ctx) : undefined,
      label: resolveActionLabel(action.label, ctx),
      disabled:
        disabledResult === true ||
        (typeof disabledResult === "object" && disabledResult !== null),
      disabledReason:
        typeof disabledResult === "object" && disabledResult !== null
          ? disabledResult.reason
          : undefined,
      icon: live?.icon ?? action.icon,
      spin: Boolean(live?.spin),
    };
  };
}
