/**
 * Surface manifest — AI Tutor (`matrx-user/education-tutor`).
 *
 * The `/education/tutor/[conversationId]` conversation surface: one live thread
 * with the Education AI Tutor, built on the same agent-execution + conversation
 * infrastructure as `/chat` and given the ONE thing that makes it a tutor —
 * grounding injection. On session start (and after every turn) the client
 * assembles the learner's cross-session memory + their own study material and
 * feeds them into the tutor agent's declared context slots.
 *
 * Deliberately does NOT `inheritsFrom: "matrx-user/education"`. The hub's
 * vocabulary (discovery axes, the study-tool registry, hub entry points, the
 * Study-today next-action list) is NOT true here — the tutor surface emits none
 * of it. It shares only the underlying study spine, and it re-reads that spine
 * through its own assembler into a different shape (`learner_memory`), so
 * inheriting would declare values nothing on this surface emits.
 *
 * Curated groups (band 0-899):
 *
 *   session      The live conversation: id, agent, turn count, view mode
 *   grounding    What the tutor was given about the learner and their material
 *   tutor_style  The learner's teaching-mode / personality tuning
 *   trust        The P0 trust envelope (confidence + citations + refusals)
 *   gates        Entitlement + school-safe compliance state on the composer
 *
 * Emitter: `features/education/tutor/components/EducationTutorClient.tsx`
 * (mounted after the conversation-id early return, so `conversation_id` is a
 * genuine guarantee).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "session",
    label: "Tutor session",
    sortOrder: 100,
    description:
      "The live tutor conversation — which thread, which agent, how far in, and whether this is the owner's live session or a read-only shared view.",
  },
  {
    key: "grounding",
    label: "Grounding",
    sortOrder: 200,
    description:
      "What the tutor was actually given about this learner: cross-session memory over the study spine, and the learner's own study material it must cite.",
  },
  {
    key: "tutor_style",
    label: "Teaching style",
    sortOrder: 300,
    description:
      "The learner's tutor tuning — Socratic vs Direct, and personality style.",
  },
  {
    key: "trust",
    label: "Trust",
    sortOrder: 400,
    description:
      "The honesty surface: grounding-derived confidence + citations, and the per-turn structured trust envelope the tutor emits with each answer.",
  },
  {
    key: "gates",
    label: "Gates",
    sortOrder: 500,
    description:
      "Why the composer may be blocked: the metered tutor-message entitlement and the school-safe (COPPA) guardian gate.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Session ───────────────────────────────────────────────────────────
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the live tutor conversation (a `chat.conversation` row). Always present — the surface only emits once a conversation exists (fresh sessions mint one before the transcript renders).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "session",
  },
  {
    name: "tutor_agent_id",
    label: "Tutor agent ID",
    description:
      "UUID of the Education AI Tutor agent driving this conversation. Always present — it is a fixed default, not a user choice.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 310,
    group: "session",
  },
  {
    name: "message_count",
    label: "Message count",
    description:
      "Total messages loaded on this conversation (both roles). Zero on a fresh, still-empty session — which is exactly when the tutor landing/starters are shown. Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "session",
  },
  {
    name: "is_fresh_session",
    label: "Fresh session",
    description:
      "True when the learner opened /education/tutor/new (no conversation id in the URL yet) rather than resuming an existing thread. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "session",
  },
  {
    name: "is_shared_view",
    label: "Read-only shared view",
    description:
      "True when this conversation was shared WITH the current user at view-only level — the composer is hidden and nothing may be written. Always present; false for the owner and for fresh sessions.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 340,
    group: "session",
  },
  {
    name: "is_embedded",
    label: "Embedded panel",
    description:
      "True when the tutor is mounted inside another study page's Ask-Tutor side panel rather than on its own route (no URL promotion, separate focus scope). Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "session",
  },
  {
    name: "grounding_seed",
    label: "Ask-Tutor seed",
    description:
      "The specific item the session was opened against via an Ask-Tutor entry point (e.g. the flashcard the learner was stuck on). Absent when the learner started the tutor cold. Bindable-only — the seed is already folded into `study_material`.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    autoContext: false,
    sortOrder: 360,
    group: "session",
  },

  // ── Grounding ─────────────────────────────────────────────────────────
  {
    name: "grounding_available",
    label: "Grounding assembled",
    description:
      "True once the learner's memory + study material have been assembled for this session. False while the assembly is in flight or after it failed — in which case `learner_memory` and `study_material` are absent and the tutor is running ungrounded. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "grounding",
  },
  {
    name: "learner_memory",
    label: "Learner memory",
    description:
      "The cross-session memory the tutor was given, assembled over the study spine: recent sessions, weak areas, and active goals rendered as text. Absent until grounding completes. Refreshed after every turn, so it never goes stale mid-conversation.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 410,
    group: "grounding",
  },
  {
    name: "study_material",
    label: "Study material",
    description:
      "The learner's OWN material the tutor must ground and cite its answers in (their decks, summaries, and the Ask-Tutor seed), rendered as text. Absent until grounding completes. Large — bindable-only, so it does not silently consume the context window of every agent run on this surface.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9000,
    autoContext: false,
    sortOrder: 420,
    group: "grounding",
  },

  // ── Teaching style ────────────────────────────────────────────────────
  {
    name: "teaching_mode",
    label: "Teaching mode",
    description:
      'The learner\'s chosen tutoring approach — "Socratic" (lead with questions) or "Direct" (answer, then check). Absent until grounding completes.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 500,
    group: "tutor_style",
  },
  {
    name: "personality_style",
    label: "Personality style",
    description:
      "The learner's chosen tutor personality/tone setting. Absent until grounding completes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 510,
    group: "tutor_style",
  },

  // ── Trust ─────────────────────────────────────────────────────────────
  {
    name: "trust_confidence",
    label: "Grounding confidence",
    description:
      'Confidence level of the grounding-derived trust envelope for this session (e.g. "grounded" when the tutor has the learner\'s own material, "inferred" when it is reasoning without it). Absent until grounding completes.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 600,
    group: "trust",
  },
  {
    name: "trust_citation_count",
    label: "Grounding citation count",
    description:
      "How many of the learner's own sources the session's grounding envelope carries. Zero means the tutor has nothing of the learner's to cite. Absent until grounding completes.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 610,
    group: "trust",
  },
  {
    name: "trust_envelope",
    label: "Grounding trust envelope",
    description:
      "The full session-level TrustEnvelope derived from grounding (confidence + citations + refusal convention), as rendered by the trust strip. Absent until grounding completes. Bindable-only — bind the two scalars above for automatic context.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    autoContext: false,
    sortOrder: 620,
    group: "trust",
  },
  {
    name: "turn_trust",
    label: "Latest turn trust envelope",
    description:
      "The machine-readable TrustEnvelope the tutor emitted for its LATEST answer (per-claim citations / refusal). Absent while a turn is still streaming, on a fresh session, and on older answers that predate the structured channel — in which case the session-level `trust_envelope` is the fallback. Bindable-only.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 900,
    autoContext: false,
    sortOrder: 630,
    group: "trust",
  },

  // ── Gates ─────────────────────────────────────────────────────────────
  {
    name: "send_blocked",
    label: "Composer blocked",
    description:
      "True when the learner cannot currently send a tutor message — either the metered entitlement is exhausted or the school-safe guardian gate is unresolved. Always present. Pairs with the two values below, which say WHICH.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 700,
    group: "gates",
  },
  {
    name: "compliance_blocked",
    label: "Guardian approval required",
    description:
      "True when this is an under-13 account with no active guardian link, so AI generation is blocked until a parent approves. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 710,
    group: "gates",
  },
  {
    name: "tutor_message_limit",
    label: "Tutor message limit",
    description:
      "The learner's cap on the metered `education.tutor_message` capability. Absent when the capability is unlimited for this account (the common case today).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    autoContext: false,
    sortOrder: 720,
    group: "gates",
  },
];

export const educationTutorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-tutor",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter shipped and complete for everything the tutor client loads. Not yet stamped verified: the DB sync + a live non-matching-name binding test and the Matrx-vs-matrix context check have not been run, and no agent roles are declared yet (the tutor agent itself is a fixed default, not a surface role).",
  label: "AI Tutor",
  urlPattern: "/education/tutor/[conversationId]",
  intro: `<surface_intro>
You are on the AI Tutor — one live conversation between a learner and the Education tutor agent at /education/tutor. This is not generic chat: the tutor is GROUNDED. Before the first turn the client assembles the learner's cross-session memory (recent sessions, weak areas, active goals from the study spine) and their own study material, and re-assembles both after every turn so nothing goes stale.
Read the values in tiers. The Grounding group is what the tutor actually knows about this learner — check grounding_available first; when it is false the tutor is running ungrounded and must not imply it knows the learner's history. Teaching style is the learner's explicit preference and should be honored (Socratic means lead with questions, not answers). The Trust group is the honesty contract: prefer turn_trust for the latest answer and fall back to trust_envelope; a low citation count means claims are inference, not the learner's material, and must be labeled as such.
Respect the Gates group before proposing anything that sends a message: when send_blocked is true the learner cannot reply, and compliance_blocked specifically means a guardian must approve first — never route around it. When is_shared_view is true this is someone else's conversation opened read-only; never propose a write.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createEducationTutorScope(values: {
  // alwaysAvailable: true → required
  conversation_id: string;
  tutor_agent_id: string;
  message_count: number;
  is_fresh_session: boolean;
  is_shared_view: boolean;
  is_embedded: boolean;
  grounding_available: boolean;
  send_blocked: boolean;
  compliance_blocked: boolean;
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  grounding_seed?: Record<string, unknown>;
  learner_memory?: string;
  study_material?: string;
  teaching_mode?: string;
  personality_style?: string;
  trust_confidence?: string;
  trust_citation_count?: number;
  trust_envelope?: Record<string, unknown>;
  turn_trust?: Record<string, unknown>;
  tutor_message_limit?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
