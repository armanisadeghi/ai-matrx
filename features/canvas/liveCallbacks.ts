"use client";

/**
 * LIVE CALLBACKS FOR CANVAS CONTENT — data stays JSON, behaviour stays in memory.
 *
 * The canvas stores every tab as plain JSON (it persists, it is inspectable,
 * and it refuses anything else, loudly). Some content is a live editor
 * surface whose buttons call back into the component that opened it — the
 * code-edit preview's Apply / Discard / Close-and-view. Those functions can
 * never ride in the tab's data.
 *
 * So the opener registers its handlers HERE, through the platform's one
 * callback registry (`utils/callbackManager`), and puts only their string ids
 * in the content. The renderer resolves the ids back to functions at render
 * time. When the opener is gone — it closed, it unmounted, the page reloaded —
 * the ids resolve to nothing and the renderer shows an honest one-line state
 * instead of buttons that do nothing.
 *
 * One group per open; the opener releases its groups when it closes
 * (`createCanvasCallbackScope` keeps that bookkeeping).
 */

import { callbackManager } from "@/utils/callbackManager";

export type CanvasCallbackIds<K extends string> = { readonly [P in K]: string };

export interface RegisteredCanvasCallbacks<K extends string> {
  readonly groupId: string;
  readonly ids: CanvasCallbackIds<K>;
}

/** Registers named handlers; returns the JSON-safe ids to put in content data. */
export function registerCanvasCallbacks<K extends string>(
  handlers: { readonly [P in K]: () => void },
): RegisteredCanvasCallbacks<K> {
  const groupId = callbackManager.createGroup();
  const ids = {} as { [P in K]: string };
  for (const name of Object.keys(handlers) as K[]) {
    const handler = handlers[name];
    ids[name] = callbackManager.registerWithContext<unknown>(() => handler(), {
      groupId,
    });
  }
  return { groupId, ids };
}

/** The live handler behind an id, or null once its opener released it. */
export function resolveCanvasCallback(id: unknown): (() => void) | null {
  if (typeof id !== "string" || !id) return null;
  const callback = callbackManager.get<(data?: unknown) => void>(id);
  return callback ? () => callback() : null;
}

/** Drops every handler of one open. */
export function releaseCanvasCallbacks(groupId: string): void {
  callbackManager.removeGroup(groupId);
}

/**
 * The bookkeeping for one opener: every group it registered, released
 * together when the opener closes or unmounts.
 */
export function createCanvasCallbackScope() {
  const groups = new Set<string>();
  return {
    register<K extends string>(handlers: { readonly [P in K]: () => void }): CanvasCallbackIds<K> {
      const registered = registerCanvasCallbacks(handlers);
      groups.add(registered.groupId);
      return registered.ids;
    },
    releaseAll(): void {
      for (const groupId of groups) releaseCanvasCallbacks(groupId);
      groups.clear();
    },
  };
}

export type CanvasCallbackScope = ReturnType<typeof createCanvasCallbackScope>;
