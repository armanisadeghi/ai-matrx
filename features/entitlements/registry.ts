// features/entitlements/registry.ts
//
// The capability registry — the WORDS for every metered or gated action: a
// label, a description, the paywall copy, and whose entitlement decides it.
// Consumers reference a capability by its typed id.
//
// 🚨 NOTHING HERE IS A COPY OF THE DATABASE (USAGE-GATE.md rule 1; Arman
// 2026-10-03: nothing about tiers, points or limits is hardcoded).
// `billing.capability` owns `enforced`, `min_tier` and `period`;
// `billing.capability_limit` / `billing.plan_limit` own every number. The
// resolver RPCs (`entitlement_check`, `entitlement_snapshot`,
// `org_capability_status`) report enforced / required tier / period / windows
// per capability, and every reader takes them from there. Flipping enforcement
// is one DB row:
//   update billing.capability set enforced = true where capability = '…';
// Guard: __tests__/registry-holds-no-database-copies.test.ts.
//
// Ids are namespaced `<domain>.<action>` (e.g. `education.generate_cards`).
// D-5 stays law: nothing here meters studying — every key is AI
// generation/grading depth (guarded by __tests__/core-practice-never-metered.test.ts).

// Metering principle (Arman, 2026-07-07): we meter AI GENERATION, never saved
// content. Storage + studying + keeping decks are free forever (capping what a
// user already made is the exact Quizlet/Chegg dark pattern we attack). The cost
// to protect is any path with AI involvement — especially multi-call paths
// (per-card enrichment = one model call per card) and the live grader.
//
// Every metering window (monthly + burst) lives in billing.capability_limit /
// billing.plan_limit so burst protection is tuned without a deploy.

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
  | "education.card_image_source"
  | "education.card_image_generate"
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
  // Whether each one is enforced is billing.capability's answer, never this
  // file's.
  "platform.points": def({
    id: "platform.points",
    label: "AI points",
    description:
      "The platform's unit of AI cost. Every model has a points price, so one budget covers every model instead of a separate allowance per model.",
    scope: "org",
    upgradeMessage:
      "You've used this month's AI points. They reset at the start of next month — or upgrade for a bigger monthly budget.",
  }),
  "platform.messages": def({
    id: "platform.messages",
    label: "Messages",
    description: "Messages sent to an agent this month.",
    scope: "org",
    upgradeMessage:
      "You've used this month's messages. They reset next month — or upgrade for more.",
  }),
  "platform.active_agents": def({
    id: "platform.active_agents",
    label: "Active agents",
    description:
      "How many agents can be live at once. A standing quota, not a monthly meter — counted by the agent system itself, not by billing.",
    scope: "org",
    upgradeMessage:
      "You've reached the number of active agents your plan includes. Upgrade to run more at once.",
  }),
  "platform.storage_bytes": def({
    id: "platform.storage_bytes",
    label: "Storage",
    description:
      "Total file storage. A standing quota, measured by the file system itself — billing reports the limit, not the usage.",
    scope: "org",
    upgradeMessage:
      "You've filled the storage your plan includes. Upgrade for more space, or add storage on its own.",
  }),
  "outreach.send_volume": def({
    id: "outreach.send_volume",
    label: "Outreach emails",
    description:
      "Outreach messages sent this month, across every connected mailbox. Enforced — outreach volume is what gets a sending domain blocklisted, so it is capped by plan on purpose.",
    scope: "org",
    upgradeMessage:
      "You've sent this month's outreach for your plan. It resets next month — or upgrade to reach more people.",
  }),
  "marketing.automation_run": def({
    id: "marketing.automation_run",
    label: "Marketing automations",
    description:
      "Runs of an automated marketing pipeline (crawls, audits, content generation). These are the expensive multi-step jobs, so they are capped by plan.",
    scope: "org",
    upgradeMessage:
      "You've used this month's marketing automations. They reset next month — or upgrade to run more.",
  }),

  // THE FIRST GATED CAPABILITY IN THE PLATFORM (Arman, 2026-08-14 —
  // docs/handoffs/outreach-system.md §5.6). Its gate (billing.capability
  // min_tier) is the database's; the reasoning lives on that row.
  //
  // What is NOT gated: connecting a mailbox, proving a domain, checking
  // SPF/DKIM/DMARC, warming up. All the setup work stays free — the plan gates
  // reaching a stranger's inbox, not learning how to.
  "outreach.send": def({
    id: "outreach.send",
    label: "Outreach sending",
    description:
      "Send outreach email from a verified, warmed mailbox on the organization's own domain. Gated because free accounts are what get sending infrastructure blocklisted.",
    scope: "org",
    upgradeMessage:
      "Outreach sending isn't part of the free plan — it's how we keep sending reputation clean for everyone. Upgrade to send from the mailboxes you've already connected.",
  }),
  "education.generate_cards": def({
    id: "education.generate_cards",
    label: "Generate flashcards",
    description: "AI-generate a flashcard deck from your material.",
    upgradeMessage:
      "You've used your flashcard generations this month. Upgrade for unlimited decks.",
  }),
  "education.card_image_source": def({
    id: "education.card_image_source",
    label: "Find card images",
    description:
      "An agent finds an expert image on the open web for a card face — search plus a vision judgment per card.",
    upgradeMessage:
      "You've used your card image searches this month. Upgrade to keep illustrating your decks.",
  }),
  "education.card_image_generate": def({
    id: "education.card_image_generate",
    label: "Generate card images",
    description:
      "AI-generate a verified image for a card face — generation plus adversarial accuracy checking, with retries.",
    upgradeMessage:
      "You've used your card image generations this month. Upgrade for more verified images.",
  }),
  "education.card_enrichment": def({
    id: "education.card_enrichment",
    label: "Enrich flashcards",
    description:
      "Per-card AI enrichment (mnemonics, examples, hints) — one model call per card, metered by card count.",
    upgradeMessage:
      "You've used your card enrichments this month. Upgrade for unlimited enrichment.",
  }),
  "education.tutor_message": def({
    id: "education.tutor_message",
    label: "AI tutor message",
    description: "Send a message to the grounded AI tutor.",
    upgradeMessage:
      "You've reached today's tutor messages. Upgrade for unlimited tutoring.",
  }),
  "education.audio_generate": def({
    id: "education.audio_generate",
    label: "Generate study audio",
    description: "Generate an audio study session / podcast from your material.",
    upgradeMessage:
      "You've used your audio generations this month. Upgrade for more.",
  }),
  "education.quiz_generate": def({
    id: "education.quiz_generate",
    label: "Generate a quiz",
    description: "AI-generate a quiz from your material.",
    upgradeMessage:
      "You've used your quiz generations this month. Upgrade for unlimited quizzes.",
  }),
  "education.practice_test_generate": def({
    id: "education.practice_test_generate",
    label: "Generate a practice test",
    description: "AI-generate a full practice test / mock exam.",
    upgradeMessage:
      "You've used your practice tests this month. Upgrade for unlimited exams.",
  }),
  "education.mindmap_generate": def({
    id: "education.mindmap_generate",
    label: "Generate a mind map",
    description: "AI-generate a mind map from your material.",
    upgradeMessage:
      "You've used your mind maps this month. Upgrade for unlimited maps.",
  }),
  "education.memory_generate": def({
    id: "education.memory_generate",
    label: "Generate memory aids",
    description:
      "AI-generate mnemonics, analogies, and a memory-palace scaffold from your material.",
    upgradeMessage:
      "You've used your memory-aid generations this month. Upgrade for unlimited aids.",
  }),
  "education.notes_generate": def({
    id: "education.notes_generate",
    label: "Generate smart notes",
    description: "AI-generate structured notes from your material.",
    upgradeMessage:
      "You've used your note generations this month. Upgrade for more.",
  }),
  "education.live_grade": def({
    id: "education.live_grade",
    label: "Live AI grading",
    description:
      "Real-time AI grading of a free-response / spoken answer. The most compute-heavy AI path — burst-limited.",
    upgradeMessage:
      "You've reached today's live gradings. Upgrade for unlimited AI grading.",
  }),
  "education.spoken_practice": def({
    id: "education.spoken_practice",
    label: "Spoken practice session",
    description:
      "A voice-first oral-exam / interview / debate session: AI generates grounded prompts and grades each spoken answer on meaning. Metered as one generation-heavy session.",
    upgradeMessage:
      "You've reached today's spoken practice sessions. Upgrade for unlimited oral exam, interview, and debate practice.",
  }),
  "education.image_grade": def({
    id: "education.image_grade",
    label: "Grade handwritten work",
    description:
      "Vision-AI grading of a PHOTOGRAPHED handwritten/typed worked answer — reads the image, grades on meaning, and returns a per-step breakdown. A compute-heavy vision path (photograph-your-work item answers + the standalone Grade My Work tool).",
    upgradeMessage:
      "You've reached today's handwritten-work gradings. Upgrade for unlimited photo grading.",
  }),
  "education.game_room_size": def({
    id: "education.game_room_size",
    label: "Multiplayer game room size",
    description:
      "Max players in a live study game room. A gate, not a per-period meter.",
    upgradeMessage: "Upgrade to host larger game rooms.",
  }),
  "education.ingest_document": def({
    id: "education.ingest_document",
    label: "Ingest a document",
    description:
      "Upload/import a document to turn into a study kit (the AI kit fan-out is the metered cost, not storage).",
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
