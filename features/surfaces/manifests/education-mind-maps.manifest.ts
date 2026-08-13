/**
 * Surface manifest — Mind Maps (`matrx-user/education-mind-maps`).
 *
 * The /education/mind-maps tool: turn a flashcard deck or a free-text topic
 * into a visual concept map (a content-IR `diagram_spec` — nodes for the ideas,
 * labeled edges for how they connect), persisted as an `education.study_media`
 * row with `media_kind = 'mind_map'`.
 *
 * THREE views behind one surface, each with its own mount:
 *
 *   list    /education/mind-maps            MindMapHome    — the library
 *   create  /education/mind-maps/new        MindMapNew     — the generate form
 *   detail  /education/mind-maps/[id]       MindMapDetail  — one stored map
 *           /education/mind-maps/[id]/edit  MindMapDetail  — same component
 *
 * `[id]/edit` is NOT a node editor despite the route name — it renders the same
 * `MindMapDetail` component as `[id]`, differing only in that the route calls
 * `requireAccess(..., "edit")` on the server so a view-only sharee is redirected
 * to the read-only URL. There is no editable graph anywhere in this feature: a
 * stored map's content is the agent's `ir_envelope`, and "changing" one means
 * regenerating it. `view` is therefore `"detail"` on both routes.
 *
 * Curated groups (band 0-899):
 *
 *   map_identity  Which view the learner is in — read this first
 *   library       The list view: every mind map they can see
 *   generation    The create view: the live generate-a-map request
 *   record        The detail view: the loaded row and its diagram
 *   trust         The detail view: how grounded the stored map is
 *
 * Emitters: `MindMapHome.tsx`, `MindMapNew.tsx`, `MindMapDetail.tsx` — each
 * mounts its own `SurfaceRuntimeProvider` with a synchronous `getScope` over
 * live render state (the Surface Context window polls `getScope` every 400ms,
 * so it must never fetch).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
// The generator source vocabulary, from its canonical home. The write-target
// description below interpolates this rather than re-typing the enum, so the
// prose an agent reads can never drift from what the picker offers or what the
// handler accepts. Types-only module (no React, no client) — safe for the
// manifest registry.
import { MEDIA_GENERATOR_SOURCE_KINDS } from "@/features/education/media/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "map_identity",
    label: "Mind map view",
    sortOrder: 100,
    description:
      "Which of the tool's three views the learner is in (list / create / detail) — read this first, it decides which other groups are populated.",
  },
  {
    key: "library",
    label: "Mind map library",
    sortOrder: 200,
    description:
      "The list view: every mind map the learner owns or has been shared, recent-first.",
  },
  {
    key: "generation",
    label: "Generation request",
    sortOrder: 300,
    description:
      "The create view: the live generate-a-mind-map request — where the material comes from and what angle to centre the map on.",
  },
  {
    key: "record",
    label: "Open mind map",
    sortOrder: 400,
    description:
      "The detail view: the loaded study_media row, the diagram it holds, and the learner's ownership of it.",
  },
  {
    key: "trust",
    label: "Grounding",
    sortOrder: 500,
    description:
      "The detail view's trust envelope — how grounded the stored map is in the learner's own material, and which passages it cites. Measured evidence, never writable.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Mind map view ─────────────────────────────────────────────────────
  {
    name: "view",
    label: "Current view",
    description:
      'Which view of the tool the learner is in: "list" (the library), "create" (the generate form), or "detail" (one stored map open, on either /[id] or /[id]/edit). Always present.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 300,
    group: "map_identity",
  },

  // ── Library (list view only) ──────────────────────────────────────────
  {
    name: "maps_loaded",
    label: "Library loaded",
    description:
      "True once the list view's query has finished; false while it is still loading. Absent outside the list view.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 400,
    group: "library",
  },
  {
    name: "mind_map_count",
    label: "Mind map count",
    description:
      "How many mind maps the learner can see. Zero for a learner with none yet. Absent outside the list view and until the query resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "library",
  },
  {
    name: "mind_maps",
    label: "Mind maps",
    description:
      "Every mind map on screen, recent-first, as { id, title, source_kind, source_title, status, updated_at }. Empty array for a learner with none. Absent outside the list view. The list view has no search or filter, so this is the whole library and exactly what is rendered.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1600,
    sortOrder: 420,
    group: "library",
  },

  // ── Generation request (create view only) ─────────────────────────────
  {
    name: "source_kind",
    label: "Source mode",
    description:
      'Which source the create form is set to generate from: "deck" (a flashcard deck the learner owns — grounded, and generated nodes get linked back to the exact card they summarize) or "topic" (free text — ungrounded, labelled "inferred"). Absent outside the create view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 500,
    group: "generation",
  },
  {
    name: "topic",
    label: "Topic",
    description:
      'The free-text subject the learner typed to map (e.g. "The water cycle"). Absent when the box is empty and outside the create view. Only feeds generation while source_kind is "topic"; a topic typed in deck mode is kept but unused.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 510,
    group: "generation",
  },
  {
    name: "focus",
    label: "Focus",
    description:
      'The optional angle to centre the map on (e.g. "the alliance system"), passed to the generator alongside the material. Applies in BOTH source modes. Absent when the field is blank and outside the create view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 45,
    sortOrder: 520,
    group: "generation",
  },
  {
    name: "selected_deck",
    label: "Selected deck",
    description:
      "The flashcard deck the create form will build from, as { id, name }. Absent when no deck is picked (including whenever the form is in topic mode) and outside the create view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 90,
    sortOrder: 530,
    group: "generation",
  },
  {
    name: "available_decks",
    label: "Available decks",
    description:
      "Every flashcard deck the learner can generate from, as { id, name } — the exact options the deck picker renders. Empty array when they have no decks yet. Absent outside the create view and until the deck query resolves. A deck_id written through generation_source MUST be an `id` from this list.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 540,
    group: "generation",
  },
  {
    name: "deck_count",
    label: "Deck count",
    description:
      "How many flashcard decks are available to generate from. Zero means the learner has no decks and only topic mode can work. Absent outside the create view and until the deck query resolves.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 550,
    group: "generation",
  },
  {
    name: "source_selection",
    label: "Source selection",
    description:
      "The create form's Source section as one object — { source_kind, topic, deck_id, deck_name } — with the fields that do not apply to the current mode left null. The read twin of the generation_source write target. Absent outside the create view.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 560,
    group: "generation",
  },
  {
    name: "is_generating",
    label: "Generation running",
    description:
      "True while the mind-map agent is running (the button reads \"Mapping your material…\" and the run streams in the floating window). Absent outside the create view. Writes are refused while this is true.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 570,
    group: "generation",
  },

  // ── Open mind map (detail view only) ──────────────────────────────────
  {
    name: "map_loading",
    label: "Map loading",
    description:
      "True while the detail view is still fetching the row. Absent outside the detail view. When true, every other value in the Open mind map and Grounding groups is absent.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 600,
    group: "record",
  },
  {
    name: "map_not_found",
    label: "Map unavailable",
    description:
      "True when the fetch finished and returned nothing — the map does not exist, was deleted, or the learner has no access. Absent on the happy path and outside the detail view. Present so an agent addresses the real situation instead of describing an empty map.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 610,
    group: "record",
  },
  {
    name: "mind_map_id",
    label: "Mind map ID",
    description:
      "UUID of the open mind map (its study_media row id). Absent outside the detail view and while the row is loading or unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 620,
    group: "record",
  },
  {
    name: "mind_map_title",
    label: "Mind map title",
    description:
      "Title of the open mind map — the diagram's own title where the agent produced one, otherwise the source's. Absent outside the detail view and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 630,
    group: "record",
  },
  {
    name: "mind_map_description",
    label: "Mind map description",
    description:
      "Description stored on the open mind map's row. Absent when the row has none, outside the detail view, and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 640,
    group: "record",
  },
  {
    name: "mind_map_status",
    label: "Mind map status",
    description:
      'Lifecycle status of the open mind map\'s row — "ready" for a completed map. Absent outside the detail view and while loading/unavailable.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 650,
    group: "record",
  },
  {
    name: "map_source_kind",
    label: "Map source kind",
    description:
      'What the open mind map was GENERATED from: "deck" or "topic" (the persisted provenance on the row). This is history, not the create form\'s picker — that is source_kind, in the Generation request group. Absent when the row has none, outside the detail view, and while loading/unavailable.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 660,
    group: "record",
  },
  {
    name: "map_source_title",
    label: "Map source title",
    description:
      "Human title of what the open mind map was generated from (the deck's name, or the topic text). Absent when the row has none, outside the detail view, and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 45,
    sortOrder: 670,
    group: "record",
  },
  {
    name: "map_source_id",
    label: "Map source ID",
    description:
      "Id of the deck the open mind map was generated from. Absent for a topic-sourced map (free text has no id), outside the detail view, and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 680,
    group: "record",
  },
  {
    name: "map_focus_hint",
    label: "Map focus hint",
    description:
      "The focus the learner gave when this map was generated, kept on the row's config. Absent when they gave none, outside the detail view, and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 45,
    sortOrder: 690,
    group: "record",
  },
  {
    name: "diagram_kind",
    label: "Diagram kind",
    description:
      'Which content-IR diagram shape the row holds — "diagram_spec" for every map this tool generates. Absent outside the detail view and while loading/unavailable.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 700,
    group: "record",
  },
  {
    name: "node_count",
    label: "Node count",
    description:
      "How many concept nodes the open map's diagram has. Absent outside the detail view, while loading/unavailable, and when the stored envelope is not a readable diagram.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 710,
    group: "record",
  },
  {
    name: "edge_count",
    label: "Edge count",
    description:
      "How many labeled connections the open map's diagram has. Absent under the same conditions as node_count.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 720,
    group: "record",
  },
  {
    name: "node_labels",
    label: "Node labels",
    description:
      "The concept labels on the open map's nodes, in stored order — what the learner actually sees on the canvas. Absent under the same conditions as node_count. Can be long on a large map, so it is bindable-only; bind node_count for a cheap size signal.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    autoContext: false,
    sortOrder: 730,
    group: "record",
  },
  {
    name: "linked_card_count",
    label: "Linked cards",
    description:
      "How many of the open map's nodes were resolved back to a specific source flashcard (a click on those opens the card). Zero for a topic-sourced map and for a deck map where nothing matched. Absent when the row predates card linking, outside the detail view, and while loading/unavailable.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 740,
    group: "record",
  },
  {
    name: "map_visibility",
    label: "Visibility",
    description:
      "Sharing visibility of the open mind map's row (e.g. private / shared / public). Absent outside the detail view and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 750,
    group: "record",
  },
  {
    name: "is_owner",
    label: "Learner owns this map",
    description:
      "True when the learner owns the open map, which is what gates the share / regenerate / delete controls. False for a map shared with them (a read-only viewer). Absent outside the detail view and while loading/unavailable.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 760,
    group: "record",
  },

  // ── Grounding (detail view only) ──────────────────────────────────────
  {
    name: "trust_confidence",
    label: "Confidence",
    description:
      'How grounded the open map is in the learner\'s own material: "grounded" (every claim traces to a cited passage — a deck source), "inferred" (reasoned but not directly stated — a topic source), or "not_in_material". Absent when the row carries no trust envelope, outside the detail view, and while loading/unavailable. MEASURED EVIDENCE — read it, never assert a different one.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    sortOrder: 800,
    group: "trust",
  },
  {
    name: "trust_grounded_in",
    label: "Grounded in",
    description:
      "Label of the corpus the open map was grounded against (usually the deck's title). Absent when the envelope does not name one, outside the detail view, and while loading/unavailable.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 45,
    sortOrder: 810,
    group: "trust",
  },
  {
    name: "trust_citation_count",
    label: "Citation count",
    description:
      "How many source passages the open map cites. Zero for an ungrounded (topic) map. Absent when the row carries no trust envelope, outside the detail view, and while loading/unavailable.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 820,
    group: "trust",
  },
  {
    name: "trust_citations",
    label: "Source citations",
    description:
      "The passages the open map is grounded in, as { sourceId, sourceKind, title, excerpt }. Empty for an ungrounded map. Absent under the same conditions as trust_citation_count. Carries verbatim source text and can be large — bindable-only; bind trust_citation_count / trust_confidence for automatic context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 830,
    group: "trust",
  },
];

/**
 * Write half of the 360 loop — what an agent may WRITE into the mind-map
 * GENERATOR (`/education/mind-maps/new` only).
 *
 * TWO targets, both `mode: "draft"` + `applyPolicy: "ask"`. They stage into
 * `MindMapNew`'s own React state through the SAME setters the learner's typing
 * uses, so the value appears in the form, is reversible, and reaches an agent
 * run and the DB only when the LEARNER presses "Generate mind map" — which is
 * where the COPPA gate, the entitlement guard and the canonical
 * `studyMediaService.create` path run. Nothing here spends quota or writes a
 * row. Both handlers also refuse outright while `is_generating` is true.
 *
 * WHY TWO AND NOT ONE, and why not four:
 *   • `generation_source` is ONE object because source_kind genuinely GATES the
 *     other two fields — a deck_id means nothing in topic mode and a topic
 *     means nothing in deck mode, so they are a combination the handler has to
 *     validate together, not three independent settings. Splitting them would
 *     let an agent apply a half-valid state one confirm at a time.
 *   • `generation_focus` is separate because it is genuinely independent: it is
 *     its own always-visible input, it applies in both source modes, and
 *     "actually, centre it on the alliance system instead" is a real request
 *     that should not require restating where the material comes from.
 *
 * Deliberately NOT writable:
 *   • Generating itself. It spends a real agent run and a metered entitlement;
 *     the learner presses the button. Same reasoning as education-planner's
 *     "Generate plan" and education-assessment's "Generate".
 *   • Regenerate / delete / share on the detail view. Regenerate spends a run,
 *     delete is destructive, and share is a permissions decision.
 *   • Everything in the `trust` group, plus node_count / node_labels /
 *     linked_card_count. That is DERIVED EVIDENCE produced by the generation —
 *     an agent writing a confidence score would forge the exact measurement the
 *     trust layer exists to produce.
 *   • Anything on the detail view at all: `MindMapDetail` owns no editor state.
 *     Despite the `/[id]/edit` route name it renders a VIEW (diagram + trust +
 *     owner controls); a stored map's content is the agent's `ir_envelope` and
 *     there is no node/graph editor in this feature to stage a draft into. The
 *     detail and list mounts therefore register NO handlers, so
 *     `listAgentWritableTargets()` offers nothing on those routes. That is a
 *     decision, not an oversight.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "generation_source",
    label: "Draft source",
    description: `Stages WHERE the mind map is generated from into the create form. Value is an OBJECT; include only the fields you mean to set: { source_kind?: ${MEDIA_GENERATOR_SOURCE_KINDS.map((k) => `"${k}"`).join(" | ")}, topic?: string (the subject to map, 3-500 characters, e.g. "The causes of the First World War" — the subject itself, not an instruction), deck_id?: string (the id of one of the learner's flashcard decks — it MUST be an \`id\` from available_decks; read that list first) }. The fields are GATED, and the combination is validated together: sending topic implies and switches to topic mode, sending deck_id implies and switches to deck mode, and sending both is rejected because only one can be the source. Sending source_kind alone just flips the picker, keeping whatever topic/deck was already there. Nothing is generated or saved — the learner reviews the form and presses "Generate mind map" themselves.`,
    valueType: "object",
    updatesValue: "source_selection",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 100,
  },
  {
    name: "generation_focus",
    label: "Draft focus",
    description:
      'Stages the optional angle to centre the mind map on into the create form (e.g. "the alliance system rather than the assassination", "how the stages feed back into each other"). Plain string, max 300 characters; REPLACES the whole field, so read `focus` first if you mean to extend it, and the empty string clears it back to no focus. Applies in both source modes and does not change which source is selected. The learner still presses "Generate mind map".',
    valueType: "string",
    updatesValue: "focus",
    mode: "draft",
    applyPolicy: "ask",
    group: "generation",
    sortOrder: 110,
  },
];

export const educationMindMapsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-mind-maps",
  readiness: "partial",
  readinessNote:
    "Manifest + emitters shipped for all three views (list / create / detail) and two write targets on the create view, verified with a live agent run. Not yet stamped verified: the DB sync has not been run; no agent roles or config namespaces are declared (the generator resolves via EDU_MEDIA_AGENTS.mindMap, not a surface role); no `data-surface-value` Locate anchors are tagged; a non-matching-name binding test and the Matrx-vs-matrix context check have not been run; and the entitlement guard's own transient state (gen.isChecking, the paywall/COPPA dialog flags) is deliberately not emitted — the durable fact an agent needs is is_generating.",
  label: "Mind Maps",
  urlPattern: "/education/mind-maps",
  intro: `<surface_intro>
You are on the Mind Maps tool at /education/mind-maps. It turns a learner's material into a visual concept map — nodes for the key ideas, labeled edges for how they connect — and stores each one as a study_media artifact.

Read \`view\` first; it decides which groups are populated.

In "list" the learner is browsing their library: mind_maps is the whole set, recent-first, with no search or filter in between.

In "create" they are composing a generation, and this is where you can help most. source_kind says whether the map will be built from a flashcard DECK (grounded — nodes get linked back to the exact card they summarize, and the result is cited) or from a free-text TOPIC (ungrounded, and honestly labelled "inferred"). \`topic\` and \`focus\` are the authored fields: turn "map the causes of WWI, but centre it on the alliance system" into topic + focus and stage them with generation_source and generation_focus. If you set deck_id it must be an id from available_decks — never invent one. Filling the form generates nothing; the learner presses "Generate mind map" themselves, because that spends a real agent run against their metered quota.

In "detail" one stored map is open. Despite the /[id]/edit route existing, there is no node editor — that route renders the same read view, gated so a view-only sharee cannot land on it. A stored map's content is the generated diagram; "changing" one means regenerating it, which is the learner's button to press.

Everything in the Grounding group — confidence, citations, what the map was grounded in — plus node/edge/linked-card counts is MEASURED EVIDENCE from the generation that produced the map. Reason from it and explain it; you cannot write it, and you should not talk as though it can be adjusted.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One entry of `mind_maps` (the list view's library). */
export interface MindMapListSummary {
  id: string;
  title: string;
  source_kind: string | null;
  source_title: string | null;
  status: string;
  updated_at: string;
}

/** One entry of `available_decks`, and the shape of `selected_deck`. */
export interface MindMapDeckOption {
  id: string;
  name: string;
}

/** `source_selection` — the read twin of the `generation_source` target. */
export interface MindMapSourceSelection {
  source_kind: string;
  topic: string | null;
  deck_id: string | null;
  deck_name: string | null;
}

/** One entry of `trust_citations`. */
export interface MindMapCitationSummary {
  sourceId: string;
  sourceKind: string;
  title: string | null;
  excerpt: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`. Each
 * of the three emitters passes only the keys its view actually has.
 */
export function createEducationMindMapsScope(values: {
  // alwaysAvailable: true → required
  view: "list" | "create" | "detail";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  // library (list view)
  maps_loaded?: boolean;
  mind_map_count?: number;
  mind_maps?: MindMapListSummary[];
  // generation (create view)
  source_kind?: string;
  topic?: string;
  focus?: string;
  selected_deck?: MindMapDeckOption;
  available_decks?: MindMapDeckOption[];
  deck_count?: number;
  source_selection?: MindMapSourceSelection;
  is_generating?: boolean;
  // record (detail view)
  map_loading?: boolean;
  map_not_found?: boolean;
  mind_map_id?: string;
  mind_map_title?: string;
  mind_map_description?: string;
  mind_map_status?: string;
  map_source_kind?: string;
  map_source_title?: string;
  map_source_id?: string;
  map_focus_hint?: string;
  diagram_kind?: string;
  node_count?: number;
  edge_count?: number;
  node_labels?: string[];
  linked_card_count?: number;
  map_visibility?: string;
  is_owner?: boolean;
  // trust (detail view)
  trust_confidence?: string;
  trust_grounded_in?: string;
  trust_citation_count?: number;
  trust_citations?: MindMapCitationSummary[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
