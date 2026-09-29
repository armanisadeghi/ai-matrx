/**
 * The composer Output picker's state logic: Text on by default, multi-select
 * types, any number of shapes, a shape's skill rides `addedSkills` exactly as
 * the Quickset chips do, and × resets to Text only.
 */

import type { ShapeChipSkillSource } from "../shape-chips";
import {
  DEFAULT_OUTPUT_TYPES,
  clearOutput,
  isDefaultOutput,
  kindForSkillSlug,
  readOutputTypes,
  resolveKindSkillId,
  selectedOutputKinds,
  summarizeOutput,
  toggleOutputKind,
  toggleOutputType,
} from "../composer/output-selection";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";

const skill = (id: string, skillId: string, isActive = true): ShapeChipSkillSource => ({ id, skillId, isActive });

const SKILLS = [
  skill("uuid-flash", "flashcard-set"),
  skill("uuid-timeline", "kind_timeline"),
  skill("uuid-kpi", "kind_kpi_card"),
  skill("uuid-kpi-xml", "kind_kpi_card_xml"),
  skill("uuid-other", "research-helper"),
  skill("uuid-dead", "kind_retired_thing", false),
];

describe("output types", () => {
  it("defaults to Text only, in the stored defaults too", () => {
    expect(readOutputTypes(undefined)).toEqual(["text"]);
    expect(DEFAULT_BUILDER_ADVANCED_SETTINGS.outputTypes).toEqual([...DEFAULT_OUTPUT_TYPES]);
    expect(isDefaultOutput(readOutputTypes(undefined), 0)).toBe(true);
  });

  it("is multi-select and keeps catalog order", () => {
    let types = readOutputTypes(undefined);
    types = toggleOutputType(types, "video");
    types = toggleOutputType(types, "image");
    expect(types).toEqual(["text", "image", "video"]);
    types = toggleOutputType(types, "text");
    expect(types).toEqual(["image", "video"]);
    expect(isDefaultOutput(types, 0)).toBe(false);
  });
});

describe("shape ↔ skill", () => {
  it("maps skill slugs back to kinds (curated chips + kind_<kind> convention)", () => {
    expect(kindForSkillSlug("flashcard-set")).toBe("flashcard_set");
    expect(kindForSkillSlug("kind_timeline")).toBe("timeline");
    expect(kindForSkillSlug("kind_kpi_card_xml")).toBe("kpi_card");
    expect(kindForSkillSlug("research-helper")).toBeNull();
  });

  it("resolves a kind to its active skill, preferring the JSON skill over the _xml twin", () => {
    expect(resolveKindSkillId("flashcard_set", SKILLS)).toBe("uuid-flash");
    expect(resolveKindSkillId("kpi_card", SKILLS)).toBe("uuid-kpi");
    expect(resolveKindSkillId("retired_thing", SKILLS)).toBeNull();
    expect(resolveKindSkillId("no_such_kind", SKILLS)).toBeNull();
  });

  it("a shape switched on from the Quickset chips shows as selected here", () => {
    expect(selectedOutputKinds([], ["uuid-flash", "uuid-other"], SKILLS)).toEqual(["flashcard_set"]);
  });

  it("toggling a kind with a skill adds/removes that skill; one without is stored only", () => {
    let state = { outputKinds: [] as string[], addedSkills: ["uuid-other"] };
    state = toggleOutputKind(state, "timeline", SKILLS);
    expect(state).toEqual({ outputKinds: ["timeline"], addedSkills: ["uuid-other", "uuid-timeline"] });
    state = toggleOutputKind(state, "bespoke_org_kind", SKILLS);
    expect(state.outputKinds).toEqual(["timeline", "bespoke_org_kind"]);
    expect(state.addedSkills).toEqual(["uuid-other", "uuid-timeline"]);
    state = toggleOutputKind(state, "timeline", SKILLS);
    expect(state).toEqual({ outputKinds: ["bespoke_org_kind"], addedSkills: ["uuid-other"] });
  });

  it("turning off a chip-added shape removes its skill", () => {
    const state = toggleOutputKind({ outputKinds: [], addedSkills: ["uuid-flash"] }, "flashcard_set", SKILLS);
    expect(state).toEqual({ outputKinds: [], addedSkills: [] });
  });

  it("clear resets to Text only, drops every shape skill, keeps other skills", () => {
    const cleared = clearOutput(
      { outputKinds: ["bespoke_org_kind"], addedSkills: ["uuid-flash", "uuid-other", "uuid-kpi"] },
      SKILLS,
    );
    expect(cleared).toEqual({ outputTypes: ["text"], outputKinds: [], addedSkills: ["uuid-other"] });
  });
});

describe("pill label", () => {
  it("summarizes types and shapes", () => {
    expect(summarizeOutput(["text"], [])).toBe("Text");
    expect(summarizeOutput(["text", "image"], [])).toBe("Text + Image");
    expect(summarizeOutput(["text"], ["a", "b", "c"])).toBe("Text + 3 shapes");
    expect(summarizeOutput(["text"], ["a"])).toBe("Text + 1 shape");
    expect(summarizeOutput(["text", "image", "video"], ["a", "b"])).toBe("3 types + 2 shapes");
    expect(summarizeOutput([], ["flashcard_set"])).toBe("Flashcard Set");
    expect(summarizeOutput([], [])).toBe("Output");
  });
});
