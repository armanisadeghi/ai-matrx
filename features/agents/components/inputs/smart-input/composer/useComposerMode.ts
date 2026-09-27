"use client";

/**
 * useComposerMode — the ONE reader/writer of the composer's page mode.
 *
 * Resolution (Amendment 1, A1 + A7):
 *   1. First paint = the server-read "last mode used" cookie, else Chat
 *      (a new person starts in Chat).
 *   2. Once the knobs answer:
 *        remember_last_mode on  + a cookie  → keep the cookie's mode;
 *        remember_last_mode on  + no cookie → the default_mode knob;
 *        remember_last_mode off             → the default_mode knob, and the
 *                                             cookie is cleared.
 *   3. `setMode` updates the tab-wide Redux value (every composer, the top-bar
 *      switch and a floating chat follow it) and, when remembering, the cookie.
 *
 * Seeding happens once per tab: the first host that mounts seeds the slice;
 * later hosts read what is there, so a popped-out panel inherits the mode.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectComposerMode,
  setComposerMode,
} from "@/features/agents/redux/chat/chat-route.slice";
import { useSessionKnob } from "@/lib/scoped-config/sessionKnob";
import {
  COMPOSER_KNOBS,
  clearComposerModeCookie,
  readComposerModeCookieClient,
  writeComposerModeCookie,
} from "./composer-mode-cookie";
import { isComposerMode, type ComposerMode } from "./composer-types";

/**
 * The knobs are applied once per TAB, not once per host: a second composer
 * mounting later must never snap the mode back to the default after the
 * person has already chosen one in this tab.
 */
let knobsAppliedThisTab = false;

export interface UseComposerModeResult {
  mode: ComposerMode;
  setMode: (mode: ComposerMode) => void;
}

export function useComposerMode(initialMode?: ComposerMode | null): UseComposerModeResult {
  const dispatch = useAppDispatch();
  const stored = useAppSelector(selectComposerMode);
  const defaultModeKnob = useSessionKnob(COMPOSER_KNOBS.defaultMode);
  const rememberKnob = useSessionKnob(COMPOSER_KNOBS.rememberLastMode);

  // 1. Seed the tab once, synchronously enough that the first client render
  //    matches the server's (the cookie the server read, else Chat).
  const seededRef = useRef(false);
  const firstPaintMode: ComposerMode = stored ?? initialMode ?? "chat";
  useEffect(() => {
    if (stored || seededRef.current) return;
    seededRef.current = true;
    dispatch(setComposerMode(initialMode ?? readComposerModeCookieClient() ?? "chat"));
  }, [stored, initialMode, dispatch]);

  // 2. Apply the knobs once they answer — exactly once per tab.
  useEffect(() => {
    if (knobsAppliedThisTab) return;
    if (defaultModeKnob === undefined || rememberKnob === undefined) return;
    knobsAppliedThisTab = true;
    const remember = rememberKnob !== false;
    const knobDefault: ComposerMode = isComposerMode(defaultModeKnob) ? defaultModeKnob : "chat";
    const cookieMode = readComposerModeCookieClient();
    if (!remember) {
      clearComposerModeCookie();
      dispatch(setComposerMode(knobDefault));
      return;
    }
    if (!cookieMode) dispatch(setComposerMode(knobDefault));
  }, [defaultModeKnob, rememberKnob, dispatch]);

  const setMode = (next: ComposerMode) => {
    dispatch(setComposerMode(next));
    if (rememberKnob !== false) writeComposerModeCookie(next);
  };

  return { mode: firstPaintMode, setMode };
}
