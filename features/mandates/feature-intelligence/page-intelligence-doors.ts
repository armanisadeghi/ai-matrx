"use client";

import { useSyncExternalStore } from "react";
import type { IntelligenceContext } from "./types";
import type { AnyMandateKey } from "@/features/mandates/mandate-key";

export interface PageIntelligenceDoor {
  feature: string;
  context?: IntelligenceContext;
  mandateKeys?: readonly AnyMandateKey[];
}

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
