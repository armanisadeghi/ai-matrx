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

/** Node/edge skeleton of "Study Pack v1" (3bd1960c-641b-4577-8f4f-c3571a8b3544). */
const STUDY_PACK_DEF: WorkflowDefinitionLike = {
  nodes: [
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
    "pack",
    "show",
  ].map((id) => ({ id })),
  edges: [],
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
    { id: "notes", pageId: "writing", title: "Study notes", source: { kind: "node", nodeId: "notes" }, pos: { x: 0, y: 6, w: 12, h: 10 }, prefer: "live" },
    { id: "flashcards", pageId: "writing", title: "Flashcards", source: { kind: "node", nodeId: "flashcards" }, pos: { x: 12, y: 6, w: 12, h: 10 }, prefer: "live" },
    { id: "quiz", pageId: "writing", title: "Practice quiz", source: { kind: "node", nodeId: "quiz" }, pos: { x: 0, y: 16, w: 12, h: 10 }, prefer: "live" },
    { id: "lessons", pageId: "writing", title: "Lesson scripts", source: { kind: "node", nodeId: "lesson_scripts" }, pos: { x: 12, y: 16, w: 12, h: 10 }, prefer: "live" },
    { id: "images", pageId: "writing", title: "Pictures", source: { kind: "node", nodeId: "stock_images" }, pos: { x: 0, y: 26, w: 12, h: 6 }, visibility: { appearOn: "node:stock_images:started", empty: "hidden" } },
    { id: "final", pageId: "pack", title: "Your study pack", source: { kind: "node", nodeId: "show" }, pos: { x: 0, y: 0, w: 24, h: 16 }, prefer: "persisted" },
  ],
};

describe("Study Pack authored surface", () => {
  it("parses warning-free and validates clean", () => {
    const { config, warnings } = parseSurfaceConfig(STORED_CONFIG);
    expect(warnings).toEqual([]);
    expect(config.pages).toHaveLength(3);
    expect(config.readouts).toHaveLength(10);
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
