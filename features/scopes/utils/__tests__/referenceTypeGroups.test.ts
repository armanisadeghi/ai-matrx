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
import {
  allTypesToggleLabel,
  referenceTypeDisplayLabel,
  visibleReferenceTypeTokens,
} from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";

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
    // The knob's CURRENT starting value (the newest seed of the row).
    join(process.cwd(), "migrations/reference_picker_hidden_types_machinery_g11a.sql"),
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

/**
 * G5 review (2026-10-02, nightly clone): "All types" still read like storage —
 * "Entity", "Processed document", "Saved Result", "Scope", "Canvas Comment",
 * "Shared Canvas Item", "Workflow Trigger"; "Marketing" and "Marketing &amp;
 * Web" were two groups (one printing a literal entity); Note sat under
 * "Workbench" while Task sat under "Workspace"; "Careers portal" beside
 * "Agent Template"; and the count read 114 then 88.
 */
describe("the words a person reads in All types", () => {
  const seed = readFileSync(
    join(process.cwd(), "migrations/reference_picker_hidden_types_machinery_g11a.sql"),
    "utf8",
  );
  const hidden = JSON.parse(/'(\[[^']*\])'::jsonb/.exec(seed)![1]!) as string[];
  const isComponent = (t: string) =>
    t in ENTITY_TYPE_METADATA &&
    ENTITY_TYPE_METADATA[t as keyof typeof ENTITY_TYPE_METADATA].isComponent;
  const visible = visibleReferenceTypeTokens(tokens, hidden, isComponent);

  it("no visible type carries a storage word", () => {
    const storageWords = [
      "Entity",
      "Processed Document",
      "Saved Result",
      "Record",
      "Category",
      "Canvas Comment",
      "Shared Canvas Item",
      "Workflow Trigger",
    ];
    const labels = visible.map(referenceTypeDisplayLabel);
    for (const word of storageWords) expect(labels).not.toContain(word);
    // The things a person references keep a product name.
    expect(referenceTypeDisplayLabel("party")).toBe("Contact");
    // Vocabulary, "The word Context" (Arman, 2026-10-02): on screen a scope is
    // a Scope. "Record" is every row's name, so it named nothing.
    expect(referenceTypeDisplayLabel("scope")).toBe("Scope");
  });

  it("every visible type name is Title Case", () => {
    for (const t of visible) {
      for (const word of referenceTypeDisplayLabel(t).split(" ")) {
        expect(word.charAt(0)).toBe(word.charAt(0).toUpperCase());
      }
    }
    expect(referenceTypeDisplayLabel("hr_careers_portal")).toBe("Careers Portal");
  });

  it("one marketing group, decoded; notes and tasks share a group", () => {
    expect(titleCaseGroupLabel("Marketing &amp; Web")).toBe("Marketing & Web");
    expect(referenceTypeGroup("marketing_initiative")).toBe(referenceTypeGroup("web_site"));
    expect(referenceTypeGroup("note")).toBe(referenceTypeGroup("task"));
    const groups = new Set(visible.map(referenceTypeGroup));
    for (const g of groups) expect(g).not.toMatch(/&[a-z#0-9]+;/);
  });

  it("the All types count never shows a number that will change", () => {
    expect(allTypesToggleLabel(114, false)).toBe("All types");
    expect(allTypesToggleLabel(88, true)).toBe("All types (88)");
  });
});

/**
 * G6B review (2026-10-02, nightly clone): "Context › Record" and
 * "Platform › Category / Rulebook" — a group named after storage. A scope is
 * not context (vocabulary, "The word Context"); Rulebook is Masterwork's noun
 * (vocabulary § Masterwork); a platform taxonomy row is machinery.
 */
describe("no visible group is a storage word", () => {
  const seed = readFileSync(
    join(process.cwd(), "migrations/reference_picker_hidden_types_machinery_g11a.sql"),
    "utf8",
  );
  const hidden = JSON.parse(/'(\[[^']*\])'::jsonb/.exec(seed)![1]!) as string[];
  const isComponent = (t: string) =>
    t in ENTITY_TYPE_METADATA &&
    ENTITY_TYPE_METADATA[t as keyof typeof ENTITY_TYPE_METADATA].isComponent;
  const visible = visibleReferenceTypeTokens(tokens, hidden, isComponent);

  it("no group a person sees is named for machinery", () => {
    const groups = new Set(visible.map(referenceTypeGroup));
    for (const word of ["Context", "Platform", "Registry", "Runtime", "General", "Graveyard"]) {
      expect(groups).not.toContain(word);
    }
  });

  it("scopes and rulebooks sit under the product's own words; taxonomy rows are hidden", () => {
    // G11A (2026-10-07): a group of one is folded into its neighbour.
    expect(referenceTypeGroup("scope")).toBe(referenceTypeGroup("task"));
    expect(referenceTypeGroup("rulebook")).toBe(referenceTypeGroup("agent"));
    expect(visible).toContain("scope");
    expect(visible).toContain("rulebook");
    expect(visible).not.toContain("category");
  });
});
