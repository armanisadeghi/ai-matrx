"use client";

import { useSyncExternalStore } from "react";

import {
  getCaptureVersion,
  getCapturedStream,
  getCapturedStreams,
  subscribeToCapture,
} from "./recorder";
import type { CapturedStream } from "./types";

/**
 * Subscribe to the universal stream capture buffer.
 *
 * The snapshot is the version counter, not the array: `getCapturedStreams()`
 * allocates a new array each call, so returning it directly from
 * `getSnapshot` would loop forever on reference inequality.
 */
function useCaptureVersion(): number {
  return useSyncExternalStore(
    subscribeToCapture,
    getCaptureVersion,
    () => 0, // server snapshot — capture is browser-only
  );
}

/** Every captured stream, newest first. */
export function useCapturedStreams(): CapturedStream[] {
  useCaptureVersion();
  return getCapturedStreams();
}

/** One captured stream by id, live as its events arrive. */
export function useCapturedStream(
  id: string | null,
): CapturedStream | undefined {
  useCaptureVersion();
  return id ? getCapturedStream(id) : undefined;
}
