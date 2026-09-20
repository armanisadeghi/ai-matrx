"use client";

/**
 * YouTube Plane A — the one knob, read through THE runtime effective-value read.
 *
 *   `google.youtube.preview_target_keyword_required` (true; organization) —
 *       whether the publish-nothing pre-upload check asks for the keyword you
 *       want the video to rank for BEFORE it grades anything.
 *
 * A PLAN §7 row. `useEffectiveKnob` (`lib/scoped-config/effectiveKnobs.ts`) is
 * the ONE ladder-resolved runtime read — `platform.knob_resolve`, organization
 * → user → device, nearest wins — so a value an administrator changes in
 * /administration/users/limits changes what this panel does. This is not a
 * second resolver.
 *
 * 🚨 UNTIL THE ROW IS APPLIED, THE DEFAULT ANNOUNCES ITSELF.
 * `migrations/google_youtube_preview_knobs.sql` seeds it and, per campaign
 * ruling A11, the chair applies it. `knob_resolve` RAISES for an unregistered
 * key by design and `useEffectiveKnob` prints that once per address with the
 * remedy; this reader then falls back to the value the migration documents —
 * never an invented one — and `isResolving` is never true forever, because
 * `undefined` means BOTH "in flight" and "no row exists" and a caller that
 * waited for a defined value would wait for a row nobody seeded.
 */

import { useEffect, useState } from "react";

import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";

/** A knob's address is the PAIR, never a dotted string a helper re-splits. */
export const TARGET_KEYWORD_KNOB = {
  feature: "google.youtube",
  key: "preview_target_keyword_required",
} as const;

/** The value the migration documents, used when no row answers. */
export const DEFAULT_TARGET_KEYWORD_REQUIRED = true;

/**
 * The knob's value as a boolean.
 *
 * 🚨 EVERY NON-BOOLEAN IS THE DEFAULT, INCLUDING `"false"` THE STRING — which
 * is truthy in JavaScript, so the obvious `Boolean(value)` turns an
 * administrator's "off" into "on". Only a real boolean, or the two exact
 * strings a jsonb round trip can produce, decide anything.
 */
export function targetKeywordRequiredFrom(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const word = value.trim().toLowerCase();
    if (word === "true") return true;
    if (word === "false") return false;
  }
  return DEFAULT_TARGET_KEYWORD_REQUIRED;
}

/**
 * How long a caller waits for the ladder before acting on the documented
 * default — one `platform.knob_resolve` round trip, generously.
 */
export const KNOB_RESOLVE_GRACE_MS = 1_500;

export interface TargetKeywordKnob {
  required: boolean;
  /** True only while the ladder is still being asked, and never forever. */
  isResolving: boolean;
}

export function useTargetKeywordRequired(): TargetKeywordKnob {
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const raw = useEffectiveKnob(organizationId, userId, TARGET_KEYWORD_KNOB);
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGraceOver(true), KNOB_RESOLVE_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  return {
    required: targetKeywordRequiredFrom(raw),
    isResolving: raw === undefined && !graceOver,
  };
}
