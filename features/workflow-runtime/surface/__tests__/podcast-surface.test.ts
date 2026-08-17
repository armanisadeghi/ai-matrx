/**
 * Phase 5 — the Podcast authored surface (workflow.runtime_surface row
 * d2b9c7a4-1e63-4f0b-8c5d-9a47e0f21b36 for definition "Podcast Episode v1",
 * f6d0e4b2-7a91-4c58-b3aa-51e9c2d7f804). Like the Study Pack fixture, this
 * IS the stored config, verbatim: it must parse warning-free, validate
 * clean, and every trigger id must exist in the definition's vocabulary.
 * The definition additionally proves the generated run-start form: its
 * io.user_input node is what deriveRunForm turns into the pre-run form.
 */

import { parseSurfaceConfig, validateSurfaceConfig } from "../config";
import { deriveRunForm, seedRunFormValues } from "../run-form";
import {
  deriveTriggerPoints,
  type WorkflowDefinitionLike,
} from "../../trigger-points";

/** Node/edge skeleton of "Podcast Episode v1", including the io.user_input
 * node's stored config verbatim (the run form derives from it). */
const PODCAST_DEF: WorkflowDefinitionLike = {
  nodes: [
    {
      id: "inputs",
      type: "io.user_input",
      data: {
        spec_type: "io.user_input",
        label: "Episode details",
        config: {
          title: "Your episode",
          description: "Tell us what to make and we handle the rest.",
          fields: [
            {
              key: "topic",
              type: "long_text",
              label: "What should this episode be about?",
              required: true,
              placeholder: "e.g. How sleep affects memory",
              help: "A topic, a rough outline, or pasted source text all work.",
            },
            {
              key: "host_count",
              type: "number",
              label: "How many hosts?",
              default: 2,
              help: "1 is a solo narration; 2 is the classic two-host conversation.",
            },
            {
              key: "format",
              type: "choice",
              label: "Conversation style",
              options: [
                "educational",
                "news",
                "interview",
                "debate",
                "panel",
                "storytelling",
                "entertainment",
                "commentary",
              ],
              default: "educational",
            },
            {
              key: "theme",
              type: "text",
              label: "Angle or theme (optional)",
              placeholder: "e.g. keep it light and practical",
            },
            {
              key: "test_run",
              type: "yes_no",
              label: "Quick test (short audio)",
              default: true,
              help: "Keeps the audio short so you can preview the result fast.",
            },
          ],
        },
      },
    },
    { id: "episode", type: "podcast.episode.generate" },
    { id: "show", type: "output.to_frontend" },
  ],
  edges: [
    { id: "e_inputs_episode", source: "inputs", target: "episode" },
    { id: "e_episode_show", source: "episode", target: "show" },
  ],
};

/** The stored config document, verbatim. */
const STORED_CONFIG = {
  schemaVersion: 1,
  deliverableNodeId: "show",
  pages: [
    { id: "brief", title: "Your brief" },
    { id: "making", title: "Making your episode", activateOn: "node:episode:started" },
    { id: "episode", title: "Your episode", activateOn: "deliverable:ready" },
  ],
  readouts: [
    { id: "rail-brief", pageId: "brief", source: { kind: "progressRail", nodeIds: ["inputs", "episode"], syntheticSteps: { inputs: ["Reading your brief"] } }, pos: { x: 0, y: 0, w: 24, h: 5 } },
    { id: "brief", pageId: "brief", title: "Your brief", source: { kind: "node", nodeId: "inputs" }, pos: { x: 0, y: 5, w: 24, h: 9 } },
    { id: "rail-making", pageId: "making", source: { kind: "progressRail", nodeIds: ["episode"], syntheticSteps: { episode: ["Reading your topic", "Researching and preparing", "Writing the script", "Recording the voices", "Creating the artwork", "Publishing your episode"] } }, pos: { x: 0, y: 0, w: 24, h: 6 } },
    { id: "making-live", pageId: "making", title: "Behind the scenes", source: { kind: "node", nodeId: "episode" }, pos: { x: 0, y: 6, w: 24, h: 12 }, prefer: "live" },
    { id: "final", pageId: "episode", title: "Your episode", source: { kind: "node", nodeId: "show" }, pos: { x: 0, y: 0, w: 24, h: 16 }, prefer: "persisted" },
  ],
};

describe("Podcast authored surface", () => {
  it("parses warning-free and validates clean", () => {
    const { config, warnings } = parseSurfaceConfig(STORED_CONFIG);
    expect(warnings).toEqual([]);
    expect(config.pages).toHaveLength(3);
    expect(config.readouts).toHaveLength(5);
    expect(config.deliverableNodeId).toBe("show");
    expect(validateSurfaceConfig(config)).toEqual([]);
  });

  it("binds only trigger ids that exist in the definition's vocabulary", () => {
    const vocabulary = new Set(
      deriveTriggerPoints(PODCAST_DEF).map((p) => p.id),
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
    const nodeIds = new Set(PODCAST_DEF.nodes.map((n) => n.id));
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

  it("generates the run-start form from the Collect Inputs node", () => {
    const sections = deriveRunForm(PODCAST_DEF);
    expect(sections).toHaveLength(1);
    const section = sections[0];
    expect(section.nodeId).toBe("inputs");
    expect(section.fields.map((f) => f.key)).toEqual([
      "topic",
      "host_count",
      "format",
      "theme",
      "test_run",
    ]);
    const topic = section.fields[0];
    expect(topic.required).toBe(true);
    expect(topic.type).toBe("long_text");
    // Seeded defaults: the quick-test toggle starts ON so a first run is
    // cheap, and the format choice starts on its stored default.
    const values = seedRunFormValues(sections);
    expect(values.inputs.test_run).toBe(true);
    expect(values.inputs.format).toBe("educational");
    expect(values.inputs.host_count).toBe(2);
  });
});
