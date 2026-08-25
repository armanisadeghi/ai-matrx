/**
 * The Run Console — types.
 *
 * KI-049 (Arman's ruling, 2026-08-25): ONE console at three permission scopes.
 * The scope is a PROP, never a route fork — "which really should just be one
 * UI, with slightly different permissions."
 */

import type { Database } from "@/types/database.types";
import type { AutonomyVerdict } from "@/features/marketing/search-console/data-dig";

/**
 * Which brands this mount of the console governs.
 *
 *   system       — every brand on the platform (super-admin).
 *   organization — the brands one organization controls.
 *   site         — one brand, itself only.
 *
 * The same three words are the schedule cascade's tiers, on purpose: the tier
 * you are looking at is the tier your schedule is authored at.
 */
export type RunConsoleScope =
  | { tier: "system" }
  | { tier: "organization"; organizationId: string }
  | { tier: "site"; siteId: string };

export type ScheduleTier = RunConsoleScope["tier"];

/** The three tiers, nearest first. Site beats organization beats system. */
export const SCHEDULE_TIERS_NEAREST_FIRST = [
  "site",
  "organization",
  "system",
] as const;

export type EngineScheduleRow =
  Database["seo"]["Tables"]["engine_schedule"]["Row"];

export type EngineScheduleCadence = "hourly" | "daily" | "weekly";

/** What the console needs to know about one brand's site. */
export interface ConsoleSiteRow {
  id: string;
  name: string;
  domain: string;
  brand_id: string | null;
  organization_id: string;
}

/** One site's outcome from one manual pass — what the operator pokes holes in. */
export interface RunOutcome {
  siteId: string;
  siteName: string;
  finishedAt: string;
  /** When the pass began — the window the decisions are read from. */
  startedAt: string;
  /** The site's own floor, so a row can say "proposal" instead of a bare %. */
  confidenceFloor: number;
  claimed: number;
  placed: number;
  proposed: number;
  humanProtected: number;
  quarantined: number;
  returnedToQueue: number;
  placedToday: number;
  dailyCeiling: number;
  ceilingReached: boolean;
  topicsCreated: string[];
  topPhrases: string[];
  error: string | null;
  /**
   * KI-044 — the sentence to show when the assigner declined to place
   * anything, and the mode that decided it. A run that placed 0 because the
   * step is off must never read as "nothing to place".
   */
  autonomyRefusal: string | null;
  autonomyDecision: string | null;
  /** Mode 3's catch-up: proposals nobody answered inside the window. */
  timeoutApplied: number;
}

/* ───────────────────────────────────────────────────────────────────────────
 * KI-016 — the situational refresh engine.
 *
 * A different engine, the SAME console: one brand row, one Run now, one
 * schedule authored through the same cascade. The shapes differ because the
 * work differs — placement counts keywords owed, a refresh counts segments
 * whose as-of has aged.
 * ─────────────────────────────────────────────────────────────────────────── */

/** One brand's situational standing — `seo.situational_refresh_status`. */
export interface SituationalRefreshStatus {
  site_id: string;
  /** Enabled condition matchers on this brand. 0 = nothing to refresh. */
  matchers: number;
  /** How many of them are past `stale_after_hours`. */
  stale_matchers: number;
  /** The oldest "as of" on the brand. NULL = never worked out at all. */
  oldest_evaluated_at: string | null;
  newest_evaluated_at: string | null;
  /** Live situational stamps these matchers hold right now. */
  stamps: number;
  /** The knob, echoed, so the UI never invents the staleness rule. */
  stale_after_hours: number;
  /** The autonomy mode this engine will obey on this brand (KI-044). */
  autonomy: AutonomyVerdict | null;
}

/** One brand's outcome from one refresh pass. */
export interface SituationalRunOutcome {
  siteId: string;
  siteName: string;
  finishedAt: string;
  /** The window the segments were worked out over. */
  window: { start: string; end: string } | null;
  matchers: number;
  stamped: number;
  removed: number;
  remaining: number;
  passes: number;
  /** Set when autonomy said do not write — the plain sentence to show. */
  refusal: string | null;
  autonomyMode: string | null;
  /** Proposals written instead of stamps, when the mode says wait. */
  proposals: number;
  /** Mode 3's catch-up: proposals nobody answered inside the window. */
  timeoutApplied: number;
  error: string | null;
  /** Per-segment detail — what each rule found, stamped and released. */
  segments: Array<{
    matcherId: string;
    rule: string;
    dimension: string;
    value: string;
    matched: number;
    stamped: number;
    removed: number;
    proposed: number;
    error: string | null;
  }>;
}
