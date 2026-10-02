/**
 * THE PLACES VOCABULARY — where a feature's intelligence (its mandates) runs
 * (CPM-009a, P19). Owned by the package because chat, voice and the ambient
 * assistant declare their own places with it; the host's feature-intelligence
 * system (matrx-frontend `features/mandates/feature-intelligence/types.ts`)
 * re-exports these types and reads every feature's declarations.
 */
import type { AnyMandateKey } from "@ai-matrx/agents/mandates";

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
  mandateKeys: readonly AnyMandateKey[];
  /**
   * Files whose code runs these jobs — what the guard test reads. Paths are in
   * this repo, or (with `app: "workflow-studio"`) in aidream's
   * `apps/workflow-studio`.
   */
  sources: readonly string[];
  /**
   * The place is in the Workflow Studio app (aidream `apps/workflow-studio`),
   * not this repo. Its sources are read from the sibling aidream checkout.
   */
  app?: "workflow-studio";
  /**
   * Studio places whose code asks the server rather than naming the job: the
   * endpoint fragment every source calls (`/conductor-context`)…
   */
  calls?: string;
  /** …and the aidream files that route that call and name the job it runs. */
  server?: readonly string[];
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
   * Names the feature's code reads jobs through — a key map (`{ FC_MANDATES }`,
   * so `FC_MANDATES.generateCards` resolves) or one named key constant
   * (`{ DEFAULT_NEW_CHAT_MANDATE_KEY }`). The places guard follows them.
   */
  aliases?: Readonly<Record<string, string | Readonly<Record<string, string>>>>;
  /**
   * Folders the places guard scans: every component (`.tsx`) inside that runs
   * one of this feature's jobs must be named by a place.
   */
  roots?: readonly string[];
  places: readonly MandatePlace[];
}

/** A page's registration of the jobs it runs (`registerPageIntelligenceDoor`). */
export interface PageIntelligenceDoor {
  feature: string;
  context?: IntelligenceContext;
  mandateKeys?: readonly AnyMandateKey[];
}

/** The intelligence icon's props, as the package renders it. */
export interface IntelligenceIndicatorProps {
  feature?: string;
  mandateKeys?: readonly AnyMandateKey[];
  context?: IntelligenceContext;
  label?: string;
  size?: "sm" | "md";
  scope?: "feature" | "route";
  pageOnly?: boolean;
  className?: string;
}
