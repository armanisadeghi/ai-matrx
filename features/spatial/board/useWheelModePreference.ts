"use client";

/**
 * How scrolling behaves on a board — the viewer's own choice, kept in this
 * browser only (a per-viewer convenience, never shared state). Every board
 * surface (the demo, War Room, meetings) reads the same key, so the choice
 * follows the person across boards. Blocked storage falls back to "auto" and
 * the choice lasts for the visit.
 */

import { useState } from "react";
import type { WheelMode } from "../engine/wheel-input";

const WHEEL_MODE_KEY = "matrx.spatial.wheelMode";

export function useWheelModePreference(): [WheelMode, (m: WheelMode) => void] {
  const [mode, setMode] = useState<WheelMode>(() => {
    try {
      const saved = window.localStorage.getItem(WHEEL_MODE_KEY);
      return saved === "zoom" || saved === "pan" || saved === "auto" ? saved : "auto";
    } catch {
      return "auto";
    }
  });
  const update = (m: WheelMode) => {
    setMode(m);
    try {
      window.localStorage.setItem(WHEEL_MODE_KEY, m);
    } catch {
      // Storage blocked (private window): the choice lasts for this visit.
    }
  };
  return [mode, update];
}
