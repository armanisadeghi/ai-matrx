"use client";

/**
 * useCompactInputMaxHeight — the compact composer's input cap (Amendment 1, A5).
 *
 * A compact composer sits in a panel (a docked/floating canvas chat, a side
 * sheet, a floating window). Its textarea grows to a SHARE of that panel —
 * `agents.chat_composer.compact_input_max_height_pct`, org + user overridable,
 * 50% by default — then scrolls inside. The host attaches `measureRef` to the
 * element whose height is "the panel" and passes `maxInputHeightPx` as
 * `ComposerPresentation.maxInputHeightPx`. Until the panel has been measured
 * the value is `undefined` (the composer's classic 200px cap).
 *
 * THE ONE implementation — every compact host uses this, never a copy.
 */

import { useEffect, useState } from "react";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { COMPOSER_KNOBS } from "./composer-mode-cookie";

/** The knob's default when it has not answered (or answered nonsense). */
export const COMPACT_INPUT_MAX_HEIGHT_PCT_FALLBACK = 50;

export function useCompactInputMaxHeight(): {
  measureRef: (element: HTMLElement | null) => void;
  maxInputHeightPx: number | undefined;
} {
  const pctKnob = useSessionKnob(COMPOSER_KNOBS.compactInputMaxHeightPct);
  const pct = typeof pctKnob === "number" && pctKnob > 0 ? pctKnob : COMPACT_INPUT_MAX_HEIGHT_PCT_FALLBACK;
  const [panelHeight, setPanelHeight] = useState(0);
  const [panelEl, setPanelEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!panelEl) return undefined;
    const observer = new ResizeObserver(() => setPanelHeight(panelEl.clientHeight));
    observer.observe(panelEl);
    return () => observer.disconnect();
  }, [panelEl]);
  return {
    measureRef: setPanelEl,
    maxInputHeightPx: panelHeight > 0 ? Math.round((panelHeight * pct) / 100) : undefined,
  };
}
