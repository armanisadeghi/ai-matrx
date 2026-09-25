// features/mandates/feature-intelligence/types.ts
//
// The FEATURE INTELLIGENCE vocabulary — what one feature's jobs look like from
// the seat of the person working in that part of the app (UI-REGISTER
// "Feature intelligence pages", Arman 2026-09-25).

import type { MandateMemberRow } from "../member-list/types";

/**
 * Values a place's link may need (`topicId`, `setId`, `brandId`, …). A place
 * whose link needs a value the host did not supply renders as a named stop
 * with no link — never a guessed URL.
 */
export type IntelligenceContext = Readonly<Record<string, string | undefined>>;

/**
 * ONE PLACE in a feature where intelligence runs — a screen, and the control
 * on it that starts the job. Declared by the feature that owns the screen, next
 * to the code that runs the job, and proved against that code by a test (see
 * `features/flashcards/data/intelligence-places.ts`).
 */
export interface MandatePlace {
  /** Stable id inside the feature. */
  id: string;
  /** The screen, as a person names it ("Deck page"). */
  label: string;
  /** The control or moment that runs the job there ("Generate button"). */
  trigger: string;
  /**
   * The route, with `[param]` segments filled from the host's context
   * (`/research/topics/[topicId]/sources`). Absent for places with no page.
   */
  urlPattern?: string;
  /** The jobs this place runs. */
  mandateKeys: readonly string[];
  /** Repo files whose code runs these jobs — what the guard test reads. */
  sources: readonly string[];
}

export interface FeaturePlaces {
  /** The mandate-key prefix this feature owns (`flashcards`) — also its URL slug. */
  feature: string;
  label: string;
  /**
   * More key prefixes the same feature owns (`podcast_client` for `podcast`).
   * Their jobs appear on this feature's page.
   */
  extraPrefixes?: readonly string[];
  /**
   * Named key maps the feature's code reads jobs through (`{ FC_MANDATES }`) —
   * the places guard resolves `FC_MANDATES.generateCards` to its key.
   */
  aliases?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /**
   * Folders the places guard scans: every component (`.tsx`) inside that runs
   * one of this feature's jobs must be named by a place.
   */
  roots?: readonly string[];
  places: readonly MandatePlace[];
}

/**
 * A place as the page shows it: a declared place, or a place recorded on a
 * registered screen (`ui.ui_surface_agent_role`).
 */
export interface ResolvedPlace {
  id: string;
  label: string;
  trigger: string;
  /** Filled link, or null when a needed value is not known here. */
  href: string | null;
  /** The route pattern, kept so an unlinked stop can say what it needs. */
  urlPattern: string | null;
  mandateKeys: readonly string[];
  origin: "declared" | "registered";
}

/** Which ladder rung the page manages. */
export type IntelligenceLevel = "person" | "organization";

/** One job of the feature, from the viewer's seat. */
export interface FeatureIntelligenceRow extends MandateMemberRow {
  /** Name without the feature prefix the label may repeat. */
  shortName: string;
  outputKind: string | null;
  description: string | null;
}
