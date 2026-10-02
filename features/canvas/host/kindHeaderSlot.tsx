"use client";

/**
 * A kind body's controls, drawn IN the pane header.
 *
 * The pane header is the only chrome a canvas tab has: a body never draws its
 * own title bar. But some bodies own controls that only exist while they are
 * mounted (a record's previous / next and presentation switch live inside the
 * Detail primitive's render, with its context). A kind's `HeaderAction` is
 * rendered by the pane, outside that subtree, so it cannot render them itself.
 *
 * The seam: the kind's `HeaderAction` is `KindHeaderSlot`, an empty element
 * registered by canvas item id; the body portals its controls into it with
 * `<KindHeaderPortal>`. A portal keeps the body's React context, so the
 * controls behave exactly as if they were rendered in place. Module store, not
 * canvas state: a slot is a DOM node and never survives a reload.
 */

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";

const STORE = Symbol.for("ai-matrx.host.canvas.kind-header-slots");

interface SlotStore {
  slots: Map<string, HTMLElement>;
  listeners: Set<() => void>;
}

function store(): SlotStore {
  const g = globalThis as unknown as { [STORE]?: SlotStore };
  g[STORE] ??= { slots: new Map(), listeners: new Set() };
  return g[STORE];
}

function emit() {
  for (const listener of [...store().listeners]) listener();
}

function setSlot(itemId: string, element: HTMLElement | null) {
  const slots = store().slots;
  if (element) {
    if (slots.get(itemId) === element) return;
    slots.set(itemId, element);
  } else if (!slots.delete(itemId)) {
    return;
  }
  emit();
}

function subscribe(listener: () => void) {
  store().listeners.add(listener);
  return () => store().listeners.delete(listener);
}

/** A kind's `HeaderAction`: the empty element its body fills. */
export function KindHeaderSlot({ item }: CanvasKindProps) {
  const itemId = item.id;
  return (
    <span
      className="inline-flex min-w-0 items-center"
      data-kind-header-slot={itemId}
      ref={(element) => {
        setSlot(itemId, element);
        return () => setSlot(itemId, null);
      }}
    />
  );
}

/** Renders `children` into the pane header of canvas item `itemId`. */
export function KindHeaderPortal({ itemId, children }: { itemId: string; children: ReactNode }) {
  const slot = useSyncExternalStore(
    subscribe,
    () => store().slots.get(itemId) ?? null,
    () => null,
  );
  return slot ? createPortal(children, slot) : null;
}
