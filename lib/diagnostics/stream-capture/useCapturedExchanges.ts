"use client";

import { useSyncExternalStore } from "react";

import {
  getCaptureMode,
  getCapturedExchanges,
  subscribeToCapture,
} from "./recorder";
import type { CaptureMode, CapturedExchange } from "./types";

/**
 * Subscribe to the universal capture buffer.
 *
 * The snapshot functions return REFERENCE-STABLE values straight from the
 * recorder — `getCapturedExchanges()` memoizes its list and invalidates on
 * mutation. Do not "simplify" this into reading a version counter and deriving
 * the list in the component body: the React Compiler is on in this repo, sees
 * a call with no reactive dependencies, and memoizes it permanently. That bug
 * shipped once here — the panel rendered an empty list while the buffer held
 * data — and it is silent, because subscription and notification both look
 * perfectly healthy.
 */

const EMPTY: CapturedExchange[] = [];

/** Every captured exchange, newest first. */
export function useCapturedExchanges(): CapturedExchange[] {
  return useSyncExternalStore(
    subscribeToCapture,
    getCapturedExchanges,
    () => EMPTY, // server snapshot — capture is browser-only
  );
}

/** One captured exchange by id, live as its events arrive. */
export function useCapturedExchange(
  id: string | null,
): CapturedExchange | undefined {
  const exchanges = useCapturedExchanges();
  return id ? exchanges.find((exchange) => exchange.id === id) : undefined;
}

/** The active retention mode, live. */
export function useCaptureMode(): CaptureMode {
  return useSyncExternalStore(
    subscribeToCapture,
    getCaptureMode,
    () => "minimal" as const,
  );
}
