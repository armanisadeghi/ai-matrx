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
// - `defaultFreeLimit` is a DESCRIPTIVE annotation only — it is NOT the source
//   of any number the UI or resolver reads. The SINGLE SOURCE for every limit is
//   `billing.capability_limit` in the DB: the `entitlement_snapshot` /
//   `resolve_capability` RPCs report a capability's live limits + windows (for
//   EVERY registered capability, enforced or not — F1), and the hook/meter read
//   those. Keeping a limit here too would be a second source of truth; don't.
//
// The exact free-tier numbers get one FYI-with-veto look from Arman before any
// capability is enforced (brief Deliverable 5). Until then every capability
// ships `enforced: false` — nothing is silently capped, but the limits ARE now
// visible in-product ahead of the cap (TRUST mandate).

import type { EntitlementPeriod, EntitlementTier } from "./types";

// Metering principle (Arman, 2026-07-07): we meter AI GENERATION, never saved
// content. Storage + studying + keeping decks are free forever (capping what a
// user already made is the exact Quizlet/Chegg dark pattern we attack). The cost
// to protect is any path with AI involvement — especially multi-call paths
// (per-card enrichment = one model call per card) and the live grader.
//
// Every metered capability declares a PRIMARY display period here; the actual
// enforcement windows (monthly + burst) live in billing.capability_limit so we
// can tune burst protection without a deploy.

/** All metered/gated capabilities. Extend this union by adding a registry entry. */
export type Capability =
  | "platform.points"
  | "platform.messages"
  | "platform.active_agents"
  | "platform.storage_bytes"
  | "outreach.send"
  | "outreach.send_volume"
  | "marketing.automation_run"
  | "education.generate_cards"
  | "education.card_enrichment"
  | "education.tutor_message"
  | "education.audio_generate"
  | "education.quiz_generate"
  | "education.practice_test_generate"
  | "education.mindmap_generate"
  | "education.memory_generate"
  | "education.notes_generate"
  | "education.ingest_document"
  | "education.live_grade"
  | "education.spoken_practice"
  | "education.image_grade"
  | "education.game_room_size";

export interface CapabilityDefinition {
  id: Capability;
  /** Human label for admin + nudge surfaces. */
  label: string;
  /** One-line description of what consuming this capability means. */
  description: string;
  /** Metering window. `null` = a pure gate (tier unlocks it; no usage count). */
  period: EntitlementPeriod;
  /**
   * DESCRIPTIVE design-intent annotation only — NOT read by the resolver, hook,
   * or any meter. The authoritative free-tier numbers live in
   * `billing.capability_limit` and reach the client via the snapshot RPC. Kept
   * here purely as human-readable documentation of intent; never a second source.
   */
  defaultFreeLimit: number | null;
  /** Minimum tier for ANY access (a gate). Most capabilities are `free`. */
  minTier: EntitlementTier;
  /**
   * WHOSE entitlement decides this — the user's, or the organization's?
   *
   * `user` (the default, and every education capability) meters a person's own
   * AI usage. `org` means the capability belongs to the organization that owns
   * the record being acted on: a sending mailbox, a domain, a shared workspace.
   * An `org` capability MUST be resolved with an explicit organization id
   * (`useOrgEntitlement`) — never the user's active-org selection, because
   * access may not depend on which org happens to be selected (db-rules §6).
   */
  scope?: "user" | "org";
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
  // ── PLAN DIMENSIONS ───────────────────────────────────────────────────────
  //
  // These are the things a PLAN includes (billing.plan_limit). The numbers live
  // in the database, not here — this registry supplies only the human words: a
  // label, a description, and what to say when someone runs out.
  //
  // All four ship `enforced: false`: real users are spending these today, and
  // the no-regression rule says a live capability is not switched off on an
  // agent's authority. They are VISIBLE now (users can see exactly where they
  // stand), and enforcing one later is a single DB row flip:
  //   update billing.capability set enforced = true where capability = '…';
  "platform.points": def({
    id: "platform.points",
    label: "AI points",
    description:
      "The platform's unit of AI cost. Every model has a points price (points = $ per million tokens x 20,000, so 20,000 points = $1 of model spend) — which means one budget covers every model instead of a separate allowance per model.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    scope: "org",
    enforced: false,
    upgradeMessage:
      "You've used this month's AI points. They reset at the start of next month — or upgrade for a bigger monthly budget.",
  }),
  "platform.messages": def({
    id: "platform.messages",
    label: "Messages",
    description: "Messages sent to an agent this month.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    scope: "org",
    enforced: false,
    upgradeMessage:
      "You've used this month's messages. They reset next month — or upgrade for more.",
  }),
  "platform.active_agents": def({
    id: "platform.active_agents",
    label: "Active agents",
    description:
      "How many agents can be live at once. A standing quota, not a monthly meter — counted by the agent system itself, not by billing.",
    period: null,
    defaultFreeLimit: null,
    minTier: "free",
    scope: "org",
    enforced: false,
    upgradeMessage:
      "You've reached the number of active agents your plan includes. Upgrade to run more at once.",
  }),
  "platform.storage_bytes": def({
    id: "platform.storage_bytes",
    label: "Storage",
    description:
      "Total file storage. A standing quota, measured by the file system itself — billing reports the limit, not the usage.",
    period: null,
    defaultFreeLimit: null,
    minTier: "free",
    scope: "org",
    enforced: false,
    upgradeMessage:
      "You've filled the storage your plan includes. Upgrade for more space, or add storage on its own.",
  }),
  "outreach.send_volume": def({
    id: "outreach.send_volume",
    label: "Outreach emails",
    description:
      "Outreach messages sent this month, across every connected mailbox. Enforced — outreach volume is what gets a sending domain blocklisted, so it is capped by plan on purpose.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "trial",
    scope: "org",
    enforced: true,
    upgradeMessage:
      "You've sent this month's outreach for your plan. It resets next month — or upgrade to reach more people.",
  }),
  "marketing.automation_run": def({
    id: "marketing.automation_run",
    label: "Marketing automations",
    description:
      "Runs of an automated marketing pipeline (crawls, audits, content generation). These are the expensive multi-step jobs, so they are capped by plan.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    scope: "org",
    enforced: true,
    upgradeMessage:
      "You've used this month's marketing automations. They reset next month — or upgrade to run more.",
  }),

  // THE FIRST GATED CAPABILITY IN THE PLATFORM (Arman, 2026-08-14 —
  // docs/handoffs/outreach-system.md §5.6). Everything above ships
  // `enforced: false`; this one ships `true`, and it is the only one.
  //
  // It is safe to enforce on day one precisely because it takes nothing away:
  // there is no send path in production yet (outreach Phase 4 is unbuilt) and
  // zero sending identities exist. Gating a capability nobody has is the only
  // kind of gate the no-regression rule permits.
  //
  // `minTier: "trial"` — not premium. The abuse filter this exists for wants an
  // IDENTIFIED account, and a trial is one. Erring toward permitting.
  //
  // What is NOT gated: connecting a mailbox, proving a domain, checking
  // SPF/DKIM/DMARC, warming up. All the setup work stays free — the plan gates
  // reaching a stranger's inbox, not learning how to.
  "outreach.send": def({
    id: "outreach.send",
    label: "Outreach sending",
    description:
      "Send outreach email from a verified, warmed mailbox on the organization's own domain. Gated because free accounts are what get sending infrastructure blocklisted.",
    period: null,
    defaultFreeLimit: null,
    minTier: "trial",
    scope: "org",
    enforced: true,
    upgradeMessage:
      "Outreach sending isn't part of the free plan — it's how we keep sending reputation clean for everyone. Upgrade to send from the mailboxes you've already connected.",
  }),
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
  "education.card_enrichment": def({
    id: "education.card_enrichment",
    label: "Enrich flashcards",
    description:
      "Per-card AI enrichment (mnemonics, examples, hints) — one model call per card, metered by card count.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your card enrichments this month. Upgrade for unlimited enrichment.",
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
  "education.memory_generate": def({
    id: "education.memory_generate",
    label: "Generate memory aids",
    description:
      "AI-generate mnemonics, analogies, and a memory-palace scaffold from your material.",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your memory-aid generations this month. Upgrade for unlimited aids.",
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
  "education.live_grade": def({
    id: "education.live_grade",
    label: "Live AI grading",
    description:
      "Real-time AI grading of a free-response / spoken answer. The most compute-heavy AI path — burst-limited.",
    period: "day",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've reached today's live gradings. Upgrade for unlimited AI grading.",
  }),
  "education.spoken_practice": def({
    id: "education.spoken_practice",
    label: "Spoken practice session",
    description:
      "A voice-first oral-exam / interview / debate session: AI generates grounded prompts and grades each spoken answer on meaning. Metered as one generation-heavy session.",
    period: "day",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've reached today's spoken practice sessions. Upgrade for unlimited oral exam, interview, and debate practice.",
  }),
  "education.image_grade": def({
    id: "education.image_grade",
    label: "Grade handwritten work",
    description:
      "Vision-AI grading of a PHOTOGRAPHED handwritten/typed worked answer — reads the image, grades on meaning, and returns a per-step breakdown. A compute-heavy vision path (photograph-your-work item answers + the standalone Grade My Work tool).",
    period: "day",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've reached today's handwritten-work gradings. Upgrade for unlimited photo grading.",
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
    description:
      "Upload/import a document to turn into a study kit (the AI kit fan-out is the metered cost, not storage).",
    period: "month",
    defaultFreeLimit: null,
    minTier: "free",
    enforced: false,
    upgradeMessage:
      "You've used your document uploads this month. Upgrade for more.",
  }),
};

export const ALL_CAPABILITIES = Object.keys(CAPABILITY_REGISTRY) as Capability[];

export function getCapability(capability: Capability): CapabilityDefinition {
  return CAPABILITY_REGISTRY[capability];
}

export function isCapability(value: string): value is Capability {
  return value in CAPABILITY_REGISTRY;
}
