/**
 * The composer Output picker's state logic: Text on by default, multi-select
 * types, any number of shapes, a pick is recorded in `outputKinds` only (the server
 * resolves its skill), and × resets to Text only.
 */

import type { ShapeChipSkillSource } from "../shape-chips";
import {
  DEFAULT_OUTPUT_TYPES,
  clearOutput,
  isDefaultOutput,
  kindForSkillSlug,
  readOutputTypes,
  conflictingKinds,
  lockedShapesFromSchema,
  migrateKindSkills,
  selectedOutputKinds,
  summarizeOutput,
  toggleOutputKind,
  toggleOutputType,
} from "../composer/output-selection";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "../../../../types/instance.types";

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

  it("a shape switched on from the Quickset chips shows as selected here", () => {
    expect(selectedOutputKinds([], ["uuid-flash", "uuid-other"], SKILLS)).toEqual(["flashcard_set"]);
  });

  it("toggling a kind records it in outputKinds only — no skill id is ever added", () => {
    let state = { outputKinds: [] as string[], addedSkills: ["uuid-other"] };
    state = toggleOutputKind(state, "timeline", SKILLS);
    expect(state).toEqual({ outputKinds: ["timeline"], addedSkills: ["uuid-other"] });
    state = toggleOutputKind(state, "bespoke_org_kind", SKILLS);
    expect(state).toEqual({ outputKinds: ["timeline", "bespoke_org_kind"], addedSkills: ["uuid-other"] });
    state = toggleOutputKind(state, "timeline", SKILLS);
    expect(state).toEqual({ outputKinds: ["bespoke_org_kind"], addedSkills: ["uuid-other"] });
  });

  it("loading an old chat moves kind skills from addedSkills into outputKinds", () => {
    const moved = migrateKindSkills(
      { outputKinds: ["quiz_set"], addedSkills: ["uuid-flash", "uuid-other", "uuid-kpi", "uuid-flash"] },
      SKILLS,
    );
    expect(moved).toEqual({ outputKinds: ["quiz_set", "flashcard_set", "kpi_card"], addedSkills: ["uuid-other"] });
    // Idempotent: a migrated chat migrates to itself.
    expect(migrateKindSkills(moved, SKILLS)).toEqual(moved);
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

describe("locked agents", () => {
  it("reads the fixed root __kind (const or enum), under any schema wrapper", () => {
    const bare = { type: "object", properties: { __kind: { const: "quiz_set" } } };
    expect(lockedShapesFromSchema(bare)).toEqual(["quiz_set"]);
    expect(lockedShapesFromSchema({ schema: bare })).toEqual(["quiz_set"]);
    expect(lockedShapesFromSchema({ json_schema: { schema: bare } })).toEqual(["quiz_set"]);
    expect(
      lockedShapesFromSchema({ properties: { __kind: { enum: ["a", "b", 3] } } }),
    ).toEqual(["a", "b"]);
  });

  it("no fixed value means not locked", () => {
    expect(lockedShapesFromSchema(null)).toEqual([]);
    expect(lockedShapesFromSchema({ properties: { __kind: { type: "string" } } })).toEqual([]);
    expect(lockedShapesFromSchema({ properties: { title: { type: "string" } } })).toEqual([]);
  });

  it("names the picks the server would refuse", () => {
    expect(conflictingKinds(["quiz_set", "timeline"], ["quiz_set"])).toEqual(["timeline"]);
    expect(conflictingKinds(["timeline"], [])).toEqual([]);
  });
});
