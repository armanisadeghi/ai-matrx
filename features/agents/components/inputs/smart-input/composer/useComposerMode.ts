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
 *
 * `enabled: false` is for a host that renders no composer this time (a room
 * shared with voice, staff or interview surfaces): it reads nothing, seeds
 * nothing and never touches the cookie.
 */

import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectComposerMode,
  setComposerMode,
} from "@/features/agents/redux/chat/chat-route.slice";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import {
  COMPOSER_KNOBS,
  clearComposerModeCookie,
  modeAfterKnobs,
  readComposerModeCookieClient,
  writeComposerModeCookie,
} from "./composer-mode-cookie";
import type { ComposerMode } from "./composer-types";

/**
 * The knobs are applied once per TAB, not once per host: a second composer
 * mounting later must never snap the mode back to the default after the
 * person has already chosen one in this tab.
 */
let knobsAppliedThisTab = false;
/** The person picked a mode in this tab (an explicit choice is never undone by the knobs). */
let choseModeThisTab = false;

export interface UseComposerModeResult {
  mode: ComposerMode;
  setMode: (mode: ComposerMode) => void;
}

export function useComposerMode(
  initialMode?: ComposerMode | null,
  { enabled = true }: { enabled?: boolean } = {},
): UseComposerModeResult {
  const dispatch = useAppDispatch();
  const stored = useAppSelector(selectComposerMode);
  // The session's knob read (`useSessionKnob`), with the organization withheld
  // when disabled — no organization means no read.
  const organizationId = useAppSelector((s) => s.appContext?.organization_id ?? null);
  const userId = useAppSelector((s) => s.userAuth?.id ?? null);
  const knobOrganization = enabled ? organizationId : null;
  const defaultModeKnob = useEffectiveKnob(knobOrganization, userId, COMPOSER_KNOBS.defaultMode);
  const rememberKnob = useEffectiveKnob(knobOrganization, userId, COMPOSER_KNOBS.rememberLastMode);

  // 1. Seed the tab once, synchronously enough that the first client render
  //    matches the server's (the cookie the server read, else Chat).
  const seededRef = useRef(false);
  const firstPaintMode: ComposerMode = stored ?? initialMode ?? "chat";
  useEffect(() => {
    if (!enabled || stored || seededRef.current) return;
    seededRef.current = true;
    dispatch(setComposerMode(initialMode ?? readComposerModeCookieClient() ?? "chat"));
  }, [enabled, stored, initialMode, dispatch]);

  // 2. Apply the knobs once they answer — exactly once per tab.
  useEffect(() => {
    if (!enabled || knobsAppliedThisTab) return;
    if (defaultModeKnob === undefined || rememberKnob === undefined) return;
    knobsAppliedThisTab = true;
    const decision = modeAfterKnobs({
      cookieMode: readComposerModeCookieClient(),
      rememberKnob,
      defaultModeKnob,
      choseThisTab: choseModeThisTab,
    });
    if (decision.clearCookie) clearComposerModeCookie();
    if (decision.apply) dispatch(setComposerMode(decision.apply));
  }, [enabled, defaultModeKnob, rememberKnob, dispatch]);

  const setMode = (next: ComposerMode) => {
    choseModeThisTab = true;
    dispatch(setComposerMode(next));
    // Before the knobs answer the cookie is written; if "remember last mode"
    // turns out to be off, the knob pass clears it (modeAfterKnobs).
    if (rememberKnob !== false) writeComposerModeCookie(next);
  };

  return { mode: firstPaintMode, setMode };
}
