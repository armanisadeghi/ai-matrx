/**
 * Every reference type lands in a sensible, Title Cased group — and a person
 * is never offered machinery.
 *
 * THE DEFECT (G2 review, 2026-10-02): the "Add a reference" picker grouped
 * types by the catalogue's `family`, which is empty for most of them, so ~90 of
 * 116 sat in one "Other" bucket; two admin buckets printed lowercase
 * ("documentation", "seo"); and machinery ("Content-IR Kind", "AI Endpoint",
 * "UI Surface") sat beside Note and Task.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ENTITY_TYPE_METADATA } from "@ai-matrx/associations";
import {
  referenceTypeGroup,
  titleCaseGroupLabel,
} from "@/features/scopes/utils/referenceTypeGroups";
import { visibleReferenceTypeTokens } from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";

const pickable = Object.values(ENTITY_TYPE_METADATA)
  .filter((m) => m.referencePickable)
  .map((m) => m.token as string);
const tokens = ["file", "url", ...pickable];

describe("reference type groups", () => {
  it("no catch-all bucket: no group is 'Other' and none holds a quarter of all types", () => {
    const sizes = new Map<string, number>();
    for (const t of tokens) {
      const g = referenceTypeGroup(t);
      sizes.set(g, (sizes.get(g) ?? 0) + 1);
    }
    expect(sizes.has("Other")).toBe(false);
    const largest = Math.max(...sizes.values());
    expect(largest).toBeLessThan(tokens.length / 4);
  });

  it("every group label is Title Case", () => {
    for (const t of tokens) {
      const label = referenceTypeGroup(t);
      for (const word of label.split(" ")) {
        if (word === "&") continue;
        expect(word.charAt(0)).toBe(word.charAt(0).toUpperCase());
      }
    }
  });

  it("titleCaseGroupLabel keeps acronyms and joiners", () => {
    expect(titleCaseGroupLabel("documentation")).toBe("Documentation");
    expect(titleCaseGroupLabel("Marketing & Web")).toBe("Marketing & Web");
    expect(titleCaseGroupLabel("AI Models")).toBe("AI Models");
    expect(referenceTypeGroup("hr_employee")).toBe("HR");
  });
});

describe("the types a person is offered", () => {
  const seed = readFileSync(
    join(process.cwd(), "migrations/reference_picker_hidden_types_knob.sql"),
    "utf8",
  );
  const hidden = JSON.parse(/'(\[[^']*\])'::jsonb/.exec(seed)![1]!) as string[];
  const isComponent = (t: string) =>
    t in ENTITY_TYPE_METADATA &&
    ENTITY_TYPE_METADATA[t as keyof typeof ENTITY_TYPE_METADATA].isComponent;

  it("the seeded hidden list names only real reference-pickable types", () => {
    for (const t of hidden) expect(pickable).toContain(t);
  });

  it("drops component types and the hidden machinery, keeps what people make", () => {
    const visible = visibleReferenceTypeTokens(tokens, hidden, isComponent);
    for (const machinery of [
      "content_ir_kind",
      "ai_endpoint",
      "flexible_data",
      "surface",
      "agent_surface_binding",
      "skill_render_definition",
      "study_plan_block",
      "workflow_plan",
    ]) {
      expect(visible).not.toContain(machinery);
    }
    for (const kept of ["note", "task", "project", "conversation", "file", "url", "agent"]) {
      expect(visible).toContain(kept);
    }
  });
});
