/**
 * The Run Console — types.
 *
 * KI-049 (Arman's ruling, 2026-08-25): ONE console at three permission scopes.
 * The scope is a PROP, never a route fork — "which really should just be one
 * UI, with slightly different permissions."
 */

import type { Database } from "@/types/database.types";

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
}
