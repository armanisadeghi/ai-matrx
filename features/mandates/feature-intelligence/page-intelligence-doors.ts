"use client";

import { useSyncExternalStore } from "react";
import type { PageIntelligenceDoor } from "@ai-matrx/chat/surfaces/runtime/intelligence-types";

export type { PageIntelligenceDoor };

const doors = new Map<symbol, PageIntelligenceDoor>();
const listeners = new Set<() => void>();
const EMPTY_DOORS: readonly PageIntelligenceDoor[] = [];
let snapshot: PageIntelligenceDoor[] = [];

function publish() {
  snapshot = [...doors.values()];
  for (const listener of listeners) listener();
}

export function registerPageIntelligenceDoor(door: PageIntelligenceDoor): () => void {
  const id = Symbol(door.feature);
  doors.set(id, door);
  publish();
  return () => {
    doors.delete(id);
    publish();
  };
}

export function usePageIntelligenceDoors(): readonly PageIntelligenceDoor[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => EMPTY_DOORS,
  );
}
