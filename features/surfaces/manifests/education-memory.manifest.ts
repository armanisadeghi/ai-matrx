/**
 * Surface manifest — Memory Aids (`matrx-user/education-memory`).
 *
 * The Memory Tools tool (VISION §11) at `/education/memory`: mnemonics,
 * analogies / memory bridges, and memory-palace scaffolds generated from a deck
 * or a topic and persisted as `education.study_media` rows with
 * `media_kind='memory_aid'` (structured content in `ir_envelope`).
 *
 * WHY THIS MANIFEST EXISTS AT ALL. `route-to-surface.ts` has mapped
 * `/education/memory` → `matrx-user/education-memory` since the tool shipped,
 * and `ui.ui_surface` already carried the row — but there was no manifest and no
 * `SurfaceRuntimeProvider` anywhere in `features/education/memory/**`. The
 * consequence was not a loud failure, which is why it survived: the Agents
 * popover resolved the route surface, listed and ran agents against it, and
 * `SurfaceAgentsPanelImpl` took the `hasLiveScope === false` branch — every run
 * launched with an EMPTY application scope behind a "Running without live page
 * context" toast. Agents were bindable here and blind here. This manifest plus
 * the three emitters close that.
 *
 * ONE SURFACE, THREE VIEWS — and why this is not the flashcard-editor split.
 * `education-flashcard-editor` was carved OUT of `education-flashcards` because
 * a full library-list vocabulary already existed and the editor could not
 * honestly promise it. Nothing existed here, so the framing is a free choice,
 * and the honest one is a single surface: this is one small tool whose three
 * routes (`/`, `/new`, `/[id]`) are steps in ONE task — pick a source, generate,
 * read the aids. An agent bound to "Memory Aids" wants to help across all three;
 * splitting would mean two more `ui_surface` rows and two more mid-path route
 * regexes to describe a list of at most a few rows and a two-field form.
 *
 * The seam that keeps that honest is `view`: the ONLY `alwaysAvailable: true`
 * value. Every other value is view-conditional and declared `false`, so the
 * scope builder's type signature makes each emitter promise exactly what its own
 * route can supply and nothing else. `/[id]/edit` renders the same read-only
 * `MemoryDetail` as `/[id]` (it is an access gate, not an editor) and therefore
 * emits `view: "detail"` too.
 *
 * WRITE TARGETS — two, on the CREATE view only, and the scoping is the whole
 * ruling. The only editable fields in this entire subtree are `MemoryNew`'s
 * source picker, topic and focus; `MemoryDetail` and `MemoryAidView` hold zero
 * inputs, and the aid's own text is not editable anywhere in the app (the human
 * path for changing an aid is Regenerate, which routes back to `/new`). So the
 * composer is the write half, and it splits into TWO independent decisions
 * rather than one composite: WHERE the aids come from (`generation_source` — a
 * deck or a topic, mutually exclusive) and WHAT ANGLE to take on it
 * (`generation_focus` — optional, applies in both source modes and does not
 * change which source is selected). Changing the focus while keeping the deck
 * is a real, distinct intent, which is what makes these two targets and not
 * one. Same design as the `education-mind-maps` sibling, deliberately — these
 * two generator forms are near-identical and should not drift.
 *
 * Both are `mode: "draft"` / `applyPolicy: "ask"`: they stage into the SAME
 * setters the learner's own typing uses, and nothing is generated or persisted.
 * Generation spends metered `education.memory_generate` quota, so the Generate
 * button stays human-pressed WITHOUT exception — that is where the COPPA gate,
 * the entitlement guard and `studyMediaService.create` run. Staging the request
 * is the agent's job; spending the quota is the learner's.
 *
 * NEVER targets here, and none of these is an oversight: deleting an aid
 * (destructive stays human), pressing Generate (metered spend), sharing or
 * visibility (permissions), and everything on the detail view — the stored
 * mnemonics, analogies and palace are generated content with no editor, and the
 * trust envelope is derived evidence. The list and detail mounts of this surface
 * register NO handlers at all. If an editor for the aid text ever ships (a
 * `studyMediaService.update` next to an input), the aid's title and its
 * mnemonic/analogy text become a strong third and fourth target.
 *
 * Deliberately does NOT `inheritsFrom: "matrx-user/education"` — the hub
 * guarantees `study_snapshot_available` / `discovery_axes` / `study_tools` /
 * `entry_points`, and this tool emits none of them (same reasoning as
 * `education-tutor`).
 *
 * Curated groups (band 0-899):
 *
 *   tool_view           Which of the three views is open (the discriminator)
 *   aid_library         The saved memory-aid sets listed on `/education/memory`
 *   generation_request  The `/new` composer — source, topic, focus
 *   memory_aid          The open aid set's structured content
 *   aid_trust           What the open aid is grounded in (READ-ONLY evidence)
 *
 * Emitters: `MemoryHome.tsx` (list), `MemoryNew.tsx` (new), `MemoryDetail.tsx`
 * (detail) — all in `features/education/memory/components/`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { MEDIA_GENERATOR_SOURCE_KINDS } from "@/features/education/media/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/** Bounds the handler enforces, spelled into the target prose so they match. */
export const MEMORY_TOPIC_MIN = 3;
export const MEMORY_TOPIC_MAX = 500;
export const MEMORY_FOCUS_MAX = 300;

const groups: SurfaceValueGroup[] = [
  {
    key: "tool_view",
    label: "Tool view",
    sortOrder: 100,
    description:
      "Which of the Memory Aids views the learner is on. Read this first — it tells you which of the other groups carry values at all.",
  },
  {
    key: "aid_library",
    label: "Aid library",
    sortOrder: 200,
    description:
      "The memory-aid sets the learner owns or can see, as listed on the tool's home page.",
  },
  {
    key: "generation_request",
    label: "Generation request",
    sortOrder: 300,
    description:
      "The composer on /education/memory/new — the source the aids will be built from and the optional focus. Nothing here is generated yet.",
  },
  {
    key: "memory_aid",
    label: "Memory aid",
    sortOrder: 400,
    description:
      "The structured content of the aid set the learner has open: mnemonics, analogies, and the memory-palace scaffold.",
  },
  {
    key: "aid_trust",
    label: "Grounding",
    sortOrder: 500,
    description:
      "What the open aid set was built from and how confident that grounding is. Derived evidence — never authored here.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Tool view ──────────────────────────────────────────────────────────
  {
    name: "view",
    label: "Current view",
    description:
      "Which Memory Aids view is open: `list` (the saved-aids home), `new` (the generation composer), or `detail` (one aid set open for reading). Always present — the read-only `/[id]/edit` access-gate route renders the same detail view and reports `detail`.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 300,
    group: "tool_view",
  },

  // ── Aid library (list view) ────────────────────────────────────────────
  {
    name: "library_loaded",
    label: "Library loaded",
    description:
      "True once the saved memory-aid sets have finished loading on the list view. False while they are still in flight — do not describe the library as empty until this is true. Absent on the new and detail views.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "aid_library",
  },
  {
    name: "aid_count",
    label: "Saved aid sets",
    description:
      "How many memory-aid sets the learner can see, after RLS filtering. 0 when the library is genuinely empty. Only present on the list view once loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "aid_library",
  },
  {
    name: "aid_library",
    label: "Aid library",
    description:
      "Every saved memory-aid set on the list view, newest first — each with its id, title, and the deck or topic it was built from. Empty array when the learner has none. Only present on the list view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 320,
    group: "aid_library",
  },

  // ── Generation request (new view) ──────────────────────────────────────
  {
    name: "request_source_kind",
    label: "Source kind",
    description:
      "Which source mode the composer is in: `deck` (build aids from one of the learner's flashcard decks) or `topic` (build them from free text they type). Only present on the new view.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "generation_request",
  },
  {
    name: "request_deck_id",
    label: "Selected deck",
    description:
      "UUID of the flashcard deck the aids will be built from. Absent when the composer is in topic mode or no deck has been picked yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "generation_request",
  },
  {
    name: "request_deck_title",
    label: "Selected deck name",
    description:
      "Name of the currently selected deck, resolved from the deck picker. Absent in topic mode, when no deck is picked, or before the deck list has loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 320,
    group: "generation_request",
  },
  {
    name: "request_topic",
    label: "Topic",
    description:
      "The free-text topic the learner typed to build aids from (e.g. \"The cranial nerves\"). Absent in deck mode or while the box is still empty.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 330,
    group: "generation_request",
  },
  {
    name: "request_focus",
    label: "Focus",
    description:
      "The optional steer the learner typed — a specific list, term set, or concept to concentrate on. Absent when the focus box is empty, which is the common case.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 340,
    group: "generation_request",
  },
  {
    name: "generation_request",
    label: "Generation request",
    description:
      "The whole composer state as one object — source kind, the deck id and name or the typed topic, and the focus. The composite twin of the four values above; present on the new view whenever any of them is.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    sortOrder: 350,
    group: "generation_request",
  },
  {
    name: "available_decks",
    label: "Available decks",
    description:
      "The flashcard decks offered in the composer's deck picker, each with its id and name. Empty array when the learner has no decks; absent until the picker's list has loaded. Only present on the new view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 360,
    group: "generation_request",
  },

  // ── Memory aid (detail view) ───────────────────────────────────────────
  {
    name: "aid_loaded",
    label: "Aid loaded",
    description:
      "True once the open memory-aid set has finished loading on the detail view. False while it is in flight or when the id is missing/denied — in which case the aid values below are absent. Absent on the list and new views.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "memory_aid",
  },
  {
    name: "aid_id",
    label: "Aid set id",
    description:
      "UUID of the memory-aid set the learner has open (its `education.study_media` row id). Present on the detail view from the first render, before the row itself has loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "memory_aid",
  },
  {
    name: "aid_title",
    label: "Aid set title",
    description:
      "Title of the open memory-aid set, as generated and stored. Absent until the row has loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 320,
    group: "memory_aid",
  },
  {
    name: "aid_is_owner",
    label: "Viewer owns this aid",
    description:
      "True when the current user owns the open aid set and therefore sees the share / regenerate / delete controls. False for a shared viewer reading someone else's aids. Absent until access has resolved.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "memory_aid",
  },
  {
    name: "aid_strategy_note",
    label: "Strategy note",
    description:
      "The short note explaining the memorization strategy chosen for this material, shown above the aids. Absent when the generator did not emit one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 340,
    group: "memory_aid",
  },
  {
    name: "mnemonics",
    label: "Mnemonics",
    description:
      "The mnemonic devices in the open set, each with its technique (`acronym` | `acrostic` | `rhyme` | `sentence` | `keyword` | `chunking`), the target material it helps memorize, the device itself, and how the device maps back. Empty array when the set has none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    sortOrder: 350,
    group: "memory_aid",
  },
  {
    name: "analogies",
    label: "Analogies",
    description:
      "The analogies / memory bridges in the open set, each with the abstract concept, the concrete analogy, and the named mapping between them. Empty array when the set has none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1100,
    sortOrder: 360,
    group: "memory_aid",
  },
  {
    name: "memory_palace",
    label: "Memory palace",
    description:
      "The method-of-loci scaffold for the open set: whether one applies at all, its journey theme, and the ordered loci (place, item, and the vivid image placed there). `applicable` is false for material too small to place.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 370,
    group: "memory_aid",
  },
  {
    name: "aid_content",
    label: "Aid content",
    description:
      "The whole coerced memory-aid payload as one object — title, strategy note, mnemonics, analogies, and the palace. The composite twin of the aid values above; absent when the stored envelope holds no usable aid content.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 3600,
    autoContext: false,
    sortOrder: 380,
    group: "memory_aid",
  },
  {
    name: "aid_source_kind",
    label: "Built from",
    description:
      "What the open set was generated from: `deck`, `note`, or `topic`. Absent until the row has loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 390,
    group: "memory_aid",
  },
  {
    name: "aid_source_title",
    label: "Source name",
    description:
      "Human name of the deck, note, or topic the open set was built from, shown as \"from …\" above the title. Absent when the stored row recorded no source title.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 50,
    sortOrder: 400,
    group: "memory_aid",
  },
  {
    name: "aid_source_id",
    label: "Source id",
    description:
      "UUID of the deck or note the open set was built from. Absent for a free-text topic source, which has no record to point at.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 410,
    group: "memory_aid",
  },

  // ── Grounding ──────────────────────────────────────────────────────────
  {
    name: "aid_confidence",
    label: "Grounding confidence",
    description:
      "How well the open set is grounded in real source material — `grounded` when built from a deck with citations, `inferred` when built from a typed topic. Absent when the row carries no trust envelope.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 300,
    group: "aid_trust",
  },
  {
    name: "aid_citations",
    label: "Cited sources",
    description:
      "The passages the open set is grounded in, from its stored trust envelope. Empty array for an inferred (topic-built) set, which cites nothing. Derived evidence — never authored on this page.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 310,
    group: "aid_trust",
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "generation_source",
    label: "Draft source",
    description: `Stages WHERE the memory aids are built from into the create form. Value is an OBJECT; include only the fields you mean to set: { source_kind?: ${MEDIA_GENERATOR_SOURCE_KINDS.map((k) => `"${k}"`).join(" | ")}, topic?: string (the material to build aids for, ${MEMORY_TOPIC_MIN}-${MEMORY_TOPIC_MAX} characters, e.g. "The twelve cranial nerves and their functions" — the subject itself, not an instruction), deck_id?: string (the id of one of the learner's flashcard decks — it MUST be an \`id\` from available_decks; read that list first) }. The fields are GATED and the combination is validated together: sending topic implies and switches to topic mode, sending deck_id implies and switches to deck mode, and sending both is rejected because only one can be the source. Sending source_kind alone just flips the picker, keeping whatever topic/deck was already there. Nothing is generated or saved — generating spends the learner's metered allowance, so they review the form and press "Generate memory aids" themselves.`,
    valueType: "object",
    updatesValue: "generation_request",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation_request",
    sortOrder: 100,
  },
  {
    name: "generation_focus",
    label: "Draft focus",
    description: `Stages the optional steer that narrows what the aids cover into the create form (e.g. "the four nerves carrying both sensory and motor fibers", "just the enzyme names, not the pathway"). Plain text string, not JSON and not JSON-encoded, no code fence; max ${MEMORY_FOCUS_MAX} characters. REPLACES the whole field, so read \`request_focus\` first if you mean to extend it, and the empty string clears it back to no focus. Applies in both source modes and does not change which source is selected. The learner still presses "Generate memory aids".`,
    valueType: "string",
    updatesValue: "request_focus",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation_request",
    sortOrder: 110,
  },
];

export const educationMemoryManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-memory",
  readiness: "partial",
  readinessNote:
    "Manifest, all three emitters (list, new, detail) and the two create-view write targets are shipped, DB-synced, and verified against live agent runs: the Agents popover names this surface, runs receive real page scope instead of the empty-scope fallback they took before, and both targets stage into the learner's own inputs behind an ask. Not yet stamped verified: no agent roles or config namespaces are declared, and two child controls on the new view load state this manifest does not declare — EntitlementMeter's `education.memory_generate` allowance and useAiComplianceGate's COPPA status.",
  label: "Memory Aids",
  urlPattern: "/education/memory",
  intro: `<surface_intro>
You are in Memory Aids at /education/memory — the tool that turns hard-to-retain material into mnemonics, analogies, and memory-palace scaffolds. It is three views in one surface, so read \`view\` FIRST: it is \`list\`, \`new\`, or \`detail\`, and it tells you which values are even present. Nothing else on this surface is guaranteed.
On \`list\` you see the learner's saved aid sets (\`aid_library\`, \`aid_count\`). Wait for \`library_loaded\` before calling the library empty.
On \`new\` the learner is composing a generation request: \`request_source_kind\` is \`deck\` or \`topic\`, and \`generation_request\` carries the whole composer state — the chosen deck (\`request_deck_id\`, \`request_deck_title\`, picked from \`available_decks\`) or the typed \`request_topic\`, plus an optional \`request_focus\`. This is the ONE view you can write to, and it is worth doing: \`generation_source\` stages the deck or topic and \`generation_focus\` stages the angle, both into the form the learner is looking at. Propose confidently — every write asks them first and declining costs nothing. Nothing is generated or saved by a write, and generating spends a metered allowance, so the Generate button is theirs to press; never imply you pressed it or that aids exist because you staged a request.
On \`detail\` one stored set is open. \`mnemonics\` carries each device with the \`technique\` it uses and the \`target\` material it covers; \`analogies\` carries concept/analogy/mapping triples; \`memory_palace\` is the method-of-loci scaffold and is often \`applicable: false\` for small material. Explaining an aid, drilling the learner on one, or judging whether a device actually helps is the work this surface exists for.
A stored aid is READ-ONLY: the write targets apply to the create form only, and the aid text is not editable in the app at all. On \`detail\`, do not offer to edit, rename, or fix a stored aid — the learner's path to different aids is to regenerate them, and you can help by staging a sharper request on \`new\`. \`aid_confidence\` and \`aid_citations\` are derived grounding evidence — cite them, never claim to change them.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry in `aid_library`. */
export interface MemoryLibraryEntry {
  id: string;
  title: string;
  source_title: string | null;
}

/** One entry in `available_decks`. */
export interface MemoryDeckOption {
  id: string;
  name: string;
}

/** The `generation_request` composite value. */
export interface MemoryGenerationRequest {
  source_kind: string;
  deck_id: string | null;
  deck_title: string | null;
  topic: string | null;
  focus: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 *
 * Only `view` is guaranteed: the three views share this surface and each emitter
 * can honestly supply only its own group.
 */
export function createEducationMemoryScope(values: {
  // alwaysAvailable: true → required
  view: "list" | "new" | "detail";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  // list
  library_loaded?: boolean;
  aid_count?: number;
  aid_library?: MemoryLibraryEntry[];
  // new
  request_source_kind?: string;
  request_deck_id?: string;
  request_deck_title?: string;
  request_topic?: string;
  request_focus?: string;
  generation_request?: MemoryGenerationRequest;
  available_decks?: MemoryDeckOption[];
  // detail
  aid_loaded?: boolean;
  aid_id?: string;
  aid_title?: string;
  aid_is_owner?: boolean;
  aid_strategy_note?: string;
  mnemonics?: unknown[];
  analogies?: unknown[];
  memory_palace?: Record<string, unknown>;
  aid_content?: Record<string, unknown>;
  aid_source_kind?: string;
  aid_source_title?: string;
  aid_source_id?: string;
  aid_confidence?: string;
  aid_citations?: unknown[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
