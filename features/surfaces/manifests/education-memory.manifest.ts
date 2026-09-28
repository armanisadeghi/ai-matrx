/**
 * Memory Aids surface: one identity across library, generator, manual editor,
 * and detail routes. The `view` value selects the relevant live values.
 * Library and detail pages expose approved collection create/update/delete
 * targets. The manual editor exposes create plus update/delete for its open
 * record. The generator also stages source/focus in its form; Generate remains
 * a human metered action. Content writes retain source and trust evidence.
 * The persisted artifact uses education.study_media and the registered
 * memory_aid kind; no alternate data or rendering path is introduced.
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
      "Which Memory Aids view is open: `list` (the saved-aids home), `new` (the generator or manual editor), or `detail` (a saved aid open for reading or editing). Always present.",
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
    name: "aid_version", label: "Aid version", description: "Revision of the saved aid. Send as expected_version for change_memory_item; stale requests are refused.", valueType: "number", alwaysAvailable: false, typicalCharCount: 6, sortOrder: 315, group: "memory_aid",
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
    name: "create_memory_aids", label: "Create memory aids",
    description: 'Creates and saves 1-25 manually authored memory aids. Value is an ARRAY of objects, each { title: string, strategy_note?: string, mnemonics: [{ technique: "acronym" | "acrostic" | "rhyme" | "sentence" | "keyword" | "chunking", target: string, device: string, explanation?: string }], analogies: [{ concept: string, analogy: string, mapping?: string }], memory_palace: { applicable: boolean, theme?: string, loci: [{ place: string, item: string, image?: string }] } }. At least one mnemonic, analogy, or applicable palace is required. No AI generation occurs. Each saved aid is marked as manually authored and carries no generated-source citation. The person approves before creation. Use this target instead of generic database tools.',
    valueType: "array", updatesValue: "aid_library", mode: "entity", applyPolicy: "ask", group: "aid_library", sortOrder: 100,
  },
  {
    name: "update_memory_aids", label: "Update memory aids",
    description: 'Changes saved memory aids. Value is an ARRAY of 1-25 objects, each { id: string, title?, strategy_note?, mnemonics?, analogies?, memory_palace? }. The id must come from aid_library on the list view or aid_id on the detail view. Only supplied fields change. Supplying a collection replaces that complete collection, including additions and removals; keep all entries you want to retain. Child shapes match create_memory_aids. Existing citations and source identity are retained. The person approves before saving.',
    valueType: "array", updatesValue: "aid_library", mode: "entity", applyPolicy: "ask", group: "aid_library", sortOrder: 110,
  },
  {
    name: "delete_memory_aids", label: "Delete memory aids",
    description: 'Soft-deletes saved memory aids so they disappear from the library; their content is no longer available through the page. Value is an ARRAY of 1-25 ids or { id } objects from aid_library or aid_id. This is destructive and the person approves every request. Do this only when explicitly asked to delete.',
    valueType: "array", updatesValue: "aid_library", mode: "entity", applyPolicy: "ask", group: "aid_library", sortOrder: 120,
  },
  {
    name: "change_memory_item", label: "Change one memory item",
    description: 'On an open memory aid with edit access, add, update, or delete ONE mnemonic, analogy, or memory-palace stop. Value is an OBJECT { action: "add" | "update" | "delete", kind: "mnemonic" | "analogy" | "locus", expected_version: number, position?: number, item?: object, theme?: string }. expected_version must equal aid_version from the same snapshot as the items; if it changed, read the items again before resubmitting. Finish or cancel unsaved human edits first. Positions are 1-based in the currently visible mnemonics, analogies, or memory_palace.loci array. Add without a position appends; update/delete require a position. Add/update supply item fields matching create_memory_aids; update changes only the supplied fields. For the first palace stop include theme. This saves only that child while retaining the other children, title, source, and citations. The person approves before saving. To delete the entire set use delete_memory_aids instead.',
    valueType: "object", updatesValue: "aid_content", mode: "entity", applyPolicy: "ask", group: "memory_aid", sortOrder: 125,
  },
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
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Create, edit, generate, and view memory aids (/education/memory).",
  readiness: "partial",
  readinessNote:
    "Memory library, generator, manual editor, and detail emit live context. Local manual create/edit/delete was exercised against a disposable record; collection agent writes are declared and await a representative agent run. Generation entitlement and COPPA state are not yet surfaced as values.",
  label: "Memory Aids",
  urlPattern: "/education/memory",
  intro: `<surface_intro>
You are in Memory Aids at /education/memory — the tool that turns hard-to-retain material into mnemonics, analogies, and memory-palace scaffolds. It is three views in one surface, so read \`view\` FIRST: it is \`list\`, \`new\`, or \`detail\`, and it tells you which values are even present. Nothing else on this surface is guaranteed.
On \`list\` you see the learner's saved aid sets (\`aid_library\`, \`aid_count\`). Wait for \`library_loaded\` before calling the library empty. Use create_memory_aids, update_memory_aids, and delete_memory_aids for approved changes to saved aids.
On \`new\` the learner may be composing a generation request or manually authoring an aid. On the generator, \`request_source_kind\` is \`deck\` or \`topic\`, and \`generation_request\` carries the chosen source and optional focus. \`generation_source\` and \`generation_focus\` stage those fields, without saving or spending the metered generation allowance. The Generate button remains theirs to press. For a manually authored aid, use create_memory_aids, which saves only after approval and does not invoke generation.
On \`detail\` one stored set is open. \`mnemonics\` carries each device with the \`technique\` it uses and the \`target\` material it covers; \`analogies\` carries concept/analogy/mapping triples; \`memory_palace\` is the method-of-loci scaffold and is often \`applicable: false\` for small material. Explaining an aid, drilling the learner on one, or judging whether a device actually helps is the work this surface exists for.
A stored aid can be edited by someone with edit access; deleting the entire set requires ownership. On \`detail\`, use change_memory_item to add, edit, or delete one mnemonic, analogy, or palace stop without replacing its siblings. Use update_memory_aids for whole-set changes and delete_memory_aids only when the person asks to remove the entire set. Each write asks for approval. You can also create a new manually authored aid with create_memory_aids. \`aid_confidence\` and \`aid_citations\` are derived grounding evidence — cite them, never claim to change them.
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
  aid_version?: number;
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
