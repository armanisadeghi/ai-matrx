"use client";

/**
 * Docs Plane A/C — the two knobs, read through THE runtime effective-value read.
 *
 *   `google.refresh.on_open_min_age_seconds` (300; organization + user) — how old
 *       a record's last refresh must be before opening it spends a Google call.
 *       Shared with the Agenda (lane U-W2 seeds it), because "how old is too old"
 *       is one posture for every Google record, not a per-surface opinion.
 *   `google.docs.append_heading` ∈ {dated, none} (dated; organization + user) —
 *       whether the Append composer stamps a dated heading.
 *
 * Both are PLAN §7 rows. `useEffectiveKnob` (`lib/scoped-config/effectiveKnobs.ts`)
 * is the ONE ladder-resolved runtime read — `platform.knob_resolve`, organization
 * → user → device, nearest wins — so a value an administrator changes in
 * /administration/users/limits changes what this panel does, and this is not a
 * second resolver.
 *
 * 🚨 UNTIL THE ROWS ARE APPLIED, THE DEFAULTS ANNOUNCE THEMSELVES. Live
 * `platform.feature_knob` held neither key on 2026-09-18 (it holds
 * `google.contacts.reimport_policy`, `google.marketing.freshness_warning_hours`
 * and `google.rollout.read_only_sweep_phase`). `knob_resolve` RAISES for an
 * unregistered key by design and `useEffectiveKnob` prints that once per address
 * with the remedy; these readers then fall back to the plan's documented value —
 * never an invented one. `migrations/google_docs_append_heading_knob.sql` (this
 * repo) seeds `append_heading`; `migrations/google_calendar_agenda_knobs.sql`
 * (lane U-W2) seeds the refresh floor. Per campaign ruling A11 the chair applies
 * them.
 */

import { useEffect, useState } from "react";

import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";

import {
  DEFAULT_APPEND_HEADING_MODE,
  isAppendHeadingMode,
  type AppendHeadingMode,
} from "./appendBlock";
import { DEFAULT_REFRESH_ON_OPEN_MIN_AGE_SECONDS } from "./record";

/** A knob's address is the PAIR, never a dotted string a helper re-splits. */
export const REFRESH_KNOB = {
  feature: "google.refresh",
  key: "on_open_min_age_seconds",
} as const;
export const APPEND_HEADING_KNOB = { feature: "google.docs", key: "append_heading" } as const;

/**
 * A whole number of seconds, or the documented default for anything else.
 *
 * 🚨 `null` AND `""` COERCE TO ZERO. `Number(null)` is `0`, which is finite and
 * not negative — so the obvious `Number.isFinite` guard alone turned "no row
 * exists" into a zero-second floor, i.e. one Google call per record opened, for
 * every organization, silently. Only a real number (or a numeric string) is a
 * value; everything else is the default.
 */
export function refreshSecondsFrom(value: unknown): number {
  const seconds =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_REFRESH_ON_OPEN_MIN_AGE_SECONDS;
  }
  return Math.floor(seconds);
}

/** The heading mode, or the documented default for anything else. */
export function appendHeadingFrom(value: unknown): AppendHeadingMode {
  return isAppendHeadingMode(value) ? value : DEFAULT_APPEND_HEADING_MODE;
}

export interface GoogleDocsKnobs {
  refreshOnOpenMinAgeSeconds: number;
  appendHeading: AppendHeadingMode;
  /**
   * True only while the refresh floor is still being resolved, and NEVER
   * forever: `useEffectiveKnob` answers `undefined` both while the read is in
   * flight AND when the key has no row at all, so a caller that waited for a
   * defined value would wait for a row nobody has seeded and refresh-on-open
   * would silently never happen. After the grace window below the documented
   * default is the answer and the decision is made.
   */
  isResolving: boolean;
}

/**
 * How long a caller waits for the ladder before acting on the documented
 * default. One `platform.knob_resolve` round trip, generously: long enough that
 * an organization's raised floor is honoured on a normal open, short enough that
 * a missing row never stops a refresh.
 */
export const KNOB_RESOLVE_GRACE_MS = 1_500;

export function useGoogleDocsKnobs(): GoogleDocsKnobs {
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const refreshRaw = useEffectiveKnob(organizationId, userId, REFRESH_KNOB);
  const headingRaw = useEffectiveKnob(organizationId, userId, APPEND_HEADING_KNOB);
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGraceOver(true), KNOB_RESOLVE_GRACE_MS);
    return () => clearTimeout(timer);
  }, []);
  return {
    refreshOnOpenMinAgeSeconds: refreshSecondsFrom(refreshRaw),
    appendHeading: appendHeadingFrom(headingRaw),
    isResolving: refreshRaw === undefined && !graceOver,
  };
}
