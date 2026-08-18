/**
 * Phase 5 — the Study Pack authored surface (workflow.runtime_surface row
 * c797a1c1-4396-411c-973e-cacc12555e60 for definition "Study Pack v1").
 * This fixture IS the stored config: it must parse warning-free, validate
 * clean, and every trigger id it binds must exist in the definition's
 * derived vocabulary. If the config contract evolves, this test forces the
 * stored row to evolve with it.
 */

import {
  parseSurfaceConfig,
  validateSurfaceConfig,
} from "../config";
import {
  deriveTriggerPoints,
  type WorkflowDefinitionLike,
} from "../../trigger-points";

/**
 * Node/edge skeleton of "Study Pack v1" (3bd1960c-641b-4577-8f4f-c3571a8b3544),
 * in definition order. The `*_items` → `*_set` → `study_pack_set` tier is the
 * persisted collection the pack page reads from.
 */
const STUDY_PACK_DEF: WorkflowDefinitionLike = {
  nodes: [
    "materials",
    "build_sources",
    "ingest",
    "structure",
    "knowledge_text",
    "notes",
    "parse_notes",
    "flashcards",
    "parse_flashcards",
    "quiz",
    "parse_quiz",
    "lesson_scripts",
    "parse_lessons",
    "stock_images",
    "study_notes",
    "flashcard_items",
    "flashcard_set",
    "quiz_mcq_items",
    "quiz_free_response_items",
    "quiz_fill_in_blank_items",
    "quiz_set",
    "study_pack_set",
    "pack",
    "show",
  ].map((id) => ({ id })),
  edges: [
    ["e_materials_sources", "materials", "build_sources"],
    ["e_sources_ingest", "build_sources", "ingest"],
    ["e_ingest_structure", "ingest", "structure"],
    ["e_structure_ktext", "structure", "knowledge_text"],
    ["e_ktext_notes", "knowledge_text", "notes"],
    ["e_ktext_flashcards", "knowledge_text", "flashcards"],
    ["e_ktext_quiz", "knowledge_text", "quiz"],
    ["e_ktext_lessons", "knowledge_text", "lesson_scripts"],
    ["e_notes_parse", "notes", "parse_notes"],
    ["e_flashcards_parse", "flashcards", "parse_flashcards"],
    ["e_quiz_parse", "quiz", "parse_quiz"],
    ["e_lessons_parse", "lesson_scripts", "parse_lessons"],
    ["e_structure_pack", "structure", "pack"],
    ["e_pnotes_pack", "parse_notes", "pack"],
    ["e_pflash_pack", "parse_flashcards", "pack"],
    ["e_pquiz_pack", "parse_quiz", "pack"],
    ["e_plessons_pack", "parse_lessons", "pack"],
    ["e_stock_pack", "stock_images", "pack"],
    ["e_ingest_pack", "ingest", "pack"],
    ["e_pflash_cards", "parse_flashcards", "flashcard_items"],
    ["e_cards_flashcard_set", "flashcard_items", "flashcard_set"],
    ["e_pflash_flashcard_set", "parse_flashcards", "flashcard_set"],
    ["e_pquiz_mcq", "parse_quiz", "quiz_mcq_items"],
    ["e_pquiz_free_response", "parse_quiz", "quiz_free_response_items"],
    ["e_pquiz_fill_in_blank", "parse_quiz", "quiz_fill_in_blank_items"],
    ["e_mcq_quiz_set", "quiz_mcq_items", "quiz_set"],
    ["e_free_response_quiz_set", "quiz_free_response_items", "quiz_set"],
    ["e_fill_in_blank_quiz_set", "quiz_fill_in_blank_items", "quiz_set"],
    ["e_pquiz_quiz_set", "parse_quiz", "quiz_set"],
    ["e_flashcard_set_pack_set", "flashcard_set", "study_pack_set"],
    ["e_quiz_set_pack_set", "quiz_set", "study_pack_set"],
    ["e_pnotes_study_notes", "parse_notes", "study_notes"],
    ["e_pack_show", "pack", "show"],
  ].map(([id, source, target]) => ({ id, source, target })),
};

/** The stored config document, verbatim. */
const STORED_CONFIG = {
  schemaVersion: 1,
  deliverableNodeId: "show",
  pages: [
    { id: "prep", title: "Preparing" },
    { id: "writing", title: "Writing", activateOn: "node:knowledge_text:completed" },
    { id: "pack", title: "Your study pack", activateOn: "deliverable:ready" },
  ],
  readouts: [
    { id: "rail-prep", pageId: "prep", source: { kind: "progressRail", nodeIds: ["ingest", "structure", "knowledge_text"], syntheticSteps: { ingest: ["Reading your materials", "Pulling out the text", "Organizing what we found"], structure: ["Mapping the big ideas", "Connecting the topics", "Building your outline"] } }, pos: { x: 0, y: 0, w: 24, h: 6 } },
    { id: "materials", pageId: "prep", title: "Your materials", source: { kind: "node", nodeId: "ingest" }, pos: { x: 0, y: 6, w: 12, h: 8 } },
    { id: "knowledge-map", pageId: "prep", title: "Knowledge map", source: { kind: "node", nodeId: "structure" }, pos: { x: 12, y: 6, w: 12, h: 8 }, visibility: { appearOn: "node:structure:started" } },
    { id: "rail-writing", pageId: "writing", source: { kind: "progressRail", nodeIds: ["notes", "flashcards", "quiz", "lesson_scripts", "stock_images", "pack"], syntheticSteps: { pack: ["Bringing it all together", "Laying out your study pack"] } }, pos: { x: 0, y: 0, w: 24, h: 6 } },
    { id: "notes", pageId: "writing", title: "Study notes", source: { kind: "node", nodeId: "study_notes" }, pos: { x: 0, y: 6, w: 12, h: 10 }, prefer: "persisted" },
    { id: "flashcards", pageId: "writing", title: "Flashcards", source: { kind: "node", nodeId: "flashcards" }, pos: { x: 12, y: 6, w: 12, h: 10 }, prefer: "live" },
    { id: "quiz", pageId: "writing", title: "Practice quiz", source: { kind: "node", nodeId: "quiz" }, pos: { x: 0, y: 16, w: 12, h: 10 }, prefer: "live" },
    { id: "lessons", pageId: "writing", title: "Lesson scripts", source: { kind: "node", nodeId: "lesson_scripts" }, pos: { x: 12, y: 16, w: 12, h: 10 }, prefer: "live" },
    { id: "images", pageId: "writing", title: "Pictures", source: { kind: "node", nodeId: "stock_images" }, pos: { x: 0, y: 26, w: 12, h: 6 }, visibility: { appearOn: "node:stock_images:started", empty: "hidden" } },
    { id: "final-flashcards", pageId: "pack", title: "Flashcards", source: { kind: "node", nodeId: "flashcard_set" }, pos: { x: 0, y: 0, w: 12, h: 12 }, prefer: "persisted" },
    { id: "final-quiz", pageId: "pack", title: "Practice quiz", source: { kind: "node", nodeId: "quiz_set" }, pos: { x: 12, y: 0, w: 12, h: 12 }, prefer: "persisted" },
  ],
};

describe("Study Pack authored surface", () => {
  it("parses warning-free and validates clean", () => {
    const { config, warnings } = parseSurfaceConfig(STORED_CONFIG);
    expect(warnings).toEqual([]);
    expect(config.pages).toHaveLength(3);
    expect(config.readouts).toHaveLength(11);
    expect(config.deliverableNodeId).toBe("show");
    expect(validateSurfaceConfig(config)).toEqual([]);
  });

  it("binds only trigger ids that exist in the definition's vocabulary", () => {
    const vocabulary = new Set(
      deriveTriggerPoints(STUDY_PACK_DEF).map((p) => p.id),
    );
    const { config } = parseSurfaceConfig(STORED_CONFIG);
    const bound: string[] = [];
    for (const page of config.pages) {
      if (page.activateOn) bound.push(page.activateOn);
    }
    for (const readout of config.readouts) {
      if (readout.visibility?.appearOn) bound.push(readout.visibility.appearOn);
      if (readout.visibility?.hideOn) bound.push(readout.visibility.hideOn);
    }
    expect(bound.length).toBeGreaterThan(0);
    for (const id of bound) {
      expect(vocabulary.has(id)).toBe(true);
    }
  });

  it("every readout source names a real node", () => {
    const nodeIds = new Set(STUDY_PACK_DEF.nodes.map((n) => n.id));
    const { config } = parseSurfaceConfig(STORED_CONFIG);
    for (const readout of config.readouts) {
      const source = readout.source;
      if (source.kind === "node" || source.kind === "childRun" || source.kind === "action") {
        expect(nodeIds.has(source.nodeId)).toBe(true);
      }
      if (source.kind === "progressRail" && source.nodeIds) {
        for (const id of source.nodeIds) expect(nodeIds.has(id)).toBe(true);
      }
    }
  });
});
