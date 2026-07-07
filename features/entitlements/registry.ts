// features/entitlements/registry.ts
//
// The capability registry — the single source of truth for every metered or
// gated action in the platform. Consumers reference a capability by its typed
// id; they never hardcode limits or tier rules. Adding a metered action = add
// one entry here (and, when enforcement flips, the matching row in
// `billing.capability_limit`).
//
// Rules:
// - Ids are namespaced `<domain>.<action>` (e.g. `education.generate_cards`).
// - `enforced: false` = the resolver returns the permissive verdict for this
//   capability regardless of tier/usage. Flip to `true` ONLY once the backend
//   limit rows + the aidream-side spend re-check both exist. This is the
//   per-capability rollout switch the brief mandates.
// - `defaultFreeLimit` is the free-tier cap used by the resolver + by nudges to
//   render "X of Y". `null` = unlimited on free (a genuinely generous default —
//   README §8 flag 2: generosity is APPROVED).
//
// The exact free-tier numbers get one FYI-with-veto look from Arman before any
// capability is enforced (brief Deliverable 5). Until then every capability
// ships `enforced: false` — nothing is silently capped.

import type { EntitlementPeriod, EntitlementTier } from "./types";

/** All metered/gated capabilities. Extend this union by adding a registry entry. */
export type Capability =
  | "education.generate_cards"
  | "education.tutor_message"
  | "education.audio_generate"
  | "education.quiz_generate"
  | "education.practice_test_generate"
  | "education.mindmap_generate"
  | "education.notes_generate"
  | "education.game_room_size"
  | "education.ingest_document"
  | "education.deck_count";

export interface CapabilityDefinition {
  id: Capability;
  /** Human label for admin + nudge surfaces. */
  label: string;
  /** One-line description of what consuming this capability means. */
  description: string;
  /** Metering window. `null` = a pure gate (tier unlocks it; no usage count). */
  period: EntitlementPeriod;
  /**
   * Free-tier cap per period. `null` = unlimited on free. The resolver reads
   * the authoritative value from `billing.capability_limit` once enforcement is
   * on; this is the design intent + the fallback the stub reports.
   */
  defaultFreeLimit: number | null;
  /** Minimum tier for ANY access (a gate). Most capabilities are `free`. */
  minTier: EntitlementTier;
  /**
   * Enforcement switch. `false` (default for every capability at launch) =>
   * resolver returns the permissive verdict. Flip per-capability as the backend
   * limit + server re-check land. NEVER flip without both in place.
   */
  enforced: boolean;
  /** Contextual paywall copy — helpful, never hostage (TRUST mandate). */
  upgradeMessage: string;
}

const def = (d: CapabilityDefinition): CapabilityDefinition => d;

export const CAPABILITY_REGISTRY: Record<Capability, CapabilityDefinition> = {
  "education.generate_cards": def({
    id: "education.generate_cards",
    label: "Generate flashcards",
    description: "AI-generate a flashcard deck from your material.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your flashcard generations this month. Upgrade for unlimited decks.",
  }),
  "education.tutor_message": def({
    id: "education.tutor_message",
    label: "AI tutor message",
    description: "Send a message to the grounded AI tutor.",
    period: "day",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've reached today's tutor messages. Upgrade for unlimited tutoring.",
  }),
  "education.audio_generate": def({
    id: "education.audio_generate",
    label: "Generate study audio",
    description: "Generate an audio study session / podcast from your material.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your audio generations this month. Upgrade for more.",
  }),
  "education.quiz_generate": def({
    id: "education.quiz_generate",
    label: "Generate a quiz",
    description: "AI-generate a quiz from your material.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your quiz generations this month. Upgrade for unlimited quizzes.",
  }),
  "education.practice_test_generate": def({
    id: "education.practice_test_generate",
    label: "Generate a practice test",
    description: "AI-generate a full practice test / mock exam.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your practice tests this month. Upgrade for unlimited exams.",
  }),
  "education.mindmap_generate": def({
    id: "education.mindmap_generate",
    label: "Generate a mind map",
    description: "AI-generate a mind map from your material.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your mind maps this month. Upgrade for unlimited maps.",
  }),
  "education.notes_generate": def({
    id: "education.notes_generate",
    label: "Generate smart notes",
    description: "AI-generate structured notes from your material.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your note generations this month. Upgrade for more.",
  }),
  "education.game_room_size": def({
    id: "education.game_room_size",
    label: "Multiplayer game room size",
    description:
      "Max players in a live study game room. A gate, not a per-period meter.",
    period: null,
    // Generous default so we never recreate the 'Kahoot tax' resentment
    // (brief Coordinates: P10). Free rooms are large.
    defaultFreeLimit: 50,
    minTier: "free",
    enforced: false,
    upgradeMessage: "Upgrade to host larger game rooms.",
  }),
  "education.ingest_document": def({
    id: "education.ingest_document",
    label: "Ingest a document",
    description: "Upload/import a document to turn into a study kit.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your document uploads this month. Upgrade for more.",
  }),
  "education.deck_count": def({
    id: "education.deck_count",
    label: "Saved decks",
    description: "Total flashcard decks a user may keep. A lifetime gate.",
    period: "lifetime",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage: "You've reached your saved-deck limit. Upgrade for unlimited decks.",
  }),
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITY_REGISTRY) as Capability[];

export function getCapability(capability: Capability): CapabilityDefinition {
  return CAPABILITY_REGISTRY[capability];
}

export function isCapability(value: string): value is Capability {
  return value in CAPABILITY_REGISTRY;
}
