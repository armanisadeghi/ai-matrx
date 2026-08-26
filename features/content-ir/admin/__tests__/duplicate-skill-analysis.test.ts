/**
 * The duplicate-skill RECOMMENDATION, pinned.
 *
 * This module decides what the resolution surface suggests to an admin. It is
 * never auto-applied — but a recommendation nobody checked is worse than none,
 * so every branch is tested here, INCLUDING the two that deliberately refuse to
 * name a winner. A recommender that always produces an answer cannot be wrong,
 * which means it cannot be trusted.
 */

import {
  countKindMentions,
  parentKindSlugs,
  recommendOwner,
  skillNamedForKind,
  type DuplicateSkillCandidate,
} from "../duplicate-skill-analysis";
import type { DoctorKindEdge } from "@/features/content-ir/registry/shape-doctor";

function candidate(
  overrides: Partial<DuplicateSkillCandidate> & { skillId: string },
): DuplicateSkillCandidate {
  return {
    label: overrides.skillId,
    body: "",
    teaches: [],
    namedForThisKind: false,
    containerKinds: [],
    mentions: 1,
    ...overrides,
  };
}

describe("skillNamedForKind", () => {
  it("accepts the R9 convention in both json and xml, dashes normalized", () => {
    expect(skillNamedForKind("kind_ner_entity_ref", "ner_entity_ref")).toBe(true);
    expect(skillNamedForKind("kind-ner-entity-ref", "ner_entity_ref")).toBe(true);
    expect(skillNamedForKind("kind_ner_entity_ref_xml", "ner_entity_ref")).toBe(true);
  });

  it("refuses a skill named for a DIFFERENT kind that merely contains this one", () => {
    // The live failure mode: a container skill whose name prefixes the item.
    expect(
      skillNamedForKind("kind_ner_canonicalization_result", "ner_entity_ref"),
    ).toBe(false);
    expect(skillNamedForKind("ner_entity_ref", "ner_entity_ref")).toBe(false);
  });
});

describe("countKindMentions", () => {
  it("counts `\"__kind\": \"<slug>\"` occurrences, tolerating spacing", () => {
    const body = '{"__kind":"card_detail"} and {"__kind"  :   "card_detail"}';
    expect(countKindMentions(body, "card_detail")).toBe(2);
  });

  it("does not count a DIFFERENT kind whose slug shares a prefix", () => {
    expect(countKindMentions('{"__kind": "card_detail_group"}', "card_detail")).toBe(0);
  });

  it("treats regex metacharacters in a slug as literal text", () => {
    expect(countKindMentions('{"__kind": "a.b"}', "a.b")).toBe(1);
    expect(countKindMentions('{"__kind": "axb"}', "a.b")).toBe(0);
  });
});

describe("parentKindSlugs", () => {
  const idBySlug = new Map([
    ["container", "p1"],
    ["item", "c1"],
  ]);
  const slugById = new Map([
    ["p1", "container"],
    ["c1", "item"],
  ]);

  it("names the kinds that embed this one", () => {
    const edges: DoctorKindEdge[] = [
      { parentDefinitionId: "p1", childDefinitionId: "c1", fieldName: "items" },
    ];
    expect(parentKindSlugs("item", idBySlug, slugById, edges)).toEqual(["container"]);
  });

  it("ignores a self-recursive edge — recursion is not containment by another kind", () => {
    const edges: DoctorKindEdge[] = [
      { parentDefinitionId: "c1", childDefinitionId: "c1", fieldName: "children" },
    ];
    expect(parentKindSlugs("item", idBySlug, slugById, edges)).toEqual([]);
  });

  it("returns nothing for a kind with no id in the live map", () => {
    expect(parentKindSlugs("ghost", idBySlug, slugById, [])).toEqual([]);
  });
});

describe("recommendOwner", () => {
  it("names the item skill when the rival is a CONTAINER that embeds the kind", () => {
    const { owner, rationale } = recommendOwner("ner_entity_ref", [
      candidate({ skillId: "kind_ner_entity_ref", namedForThisKind: true }),
      candidate({
        skillId: "kind_ner_canonicalization_result",
        containerKinds: ["ner_canonicalization_result"],
      }),
    ]);
    expect(owner).toBe("kind_ner_entity_ref");
    expect(rationale).toContain("ner_canonicalization_result");
    expect(rationale).toContain("does not own it");
  });

  it("falls back to the only standalone teacher when nobody follows the naming convention", () => {
    const { owner, rationale } = recommendOwner("citation", [
      candidate({ skillId: "legacy_citation_teacher" }),
      candidate({ skillId: "kind_report", containerKinds: ["report"] }),
    ]);
    expect(owner).toBe("legacy_citation_teacher");
    expect(rationale).toContain("only candidate");
  });

  it("REFUSES to pick when two candidates teach the kind standalone", () => {
    const { owner, rationale } = recommendOwner("citation", [
      candidate({ skillId: "citation_a" }),
      candidate({ skillId: "citation_b" }),
    ]);
    expect(owner).toBeNull();
    expect(rationale).toContain("editorial call");
  });

  it("REFUSES — and says a dedicated skill is the real fix — when EVERY candidate is a container", () => {
    const { owner, rationale } = recommendOwner("citation", [
      candidate({ skillId: "kind_report", containerKinds: ["report"] }),
      candidate({ skillId: "kind_brief", containerKinds: ["brief"] }),
    ]);
    expect(owner).toBeNull();
    expect(rationale).toContain("dedicated skill");
  });

  it("does not let a NAMED container win — naming alone is not ownership", () => {
    // A skill can be named for the kind and still only embed it; the rule
    // requires named AND standalone, so this falls through to the weaker leg.
    const { owner } = recommendOwner("citation", [
      candidate({
        skillId: "kind_citation",
        namedForThisKind: true,
        containerKinds: ["report"],
      }),
      candidate({ skillId: "other_citation" }),
    ]);
    expect(owner).toBe("other_citation");
  });
});
