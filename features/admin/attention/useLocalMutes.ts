"use client";

import { useSyncExternalStore } from "react";
import { getMuteServerSnapshot, getMuteSnapshot, subscribeMutes, type MuteMap } from "./item-mute";

/** The local mute map as render input — re-renders on every write, never via an effect. */
export function useLocalMutes(): MuteMap {
  return useSyncExternalStore(subscribeMutes, getMuteSnapshot, getMuteServerSnapshot);
}
