/**
 * R1 (kind-never-raw round 6), ruling (a): catalog prose — a skill / agent /
 * tool description that shows an example kind JSON — is documentation. A
 * person reads the example as its kind's one-line label, in text AND in
 * tooltip / `title` slots; the stored description is never rewritten.
 *
 * The shapes below are the real `skill.definition.description` shapes (92 rows
 * held `{"__kind": …}` on 2026-10-05).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { catalogProseText } from "../surfaces/kind-one-line";
import { snippetKindText } from "../surfaces/kind-snippet-text";
import { hasKindKey } from "../surfaces/json-kind-signal";

const SHAPES = [
  'How and when to emit a meta_tag_options render block as canonical {"__kind": "meta_tag_options"} JSON: the exact shape, required fields, and JSON syntax rules.',
  'How and when to emit a {"__kind":"math_problem"} render block: the flat problem/solution/step structure.',
  'Emit cards like {"__kind":"flashcard_set","title":"Cells","cards":[{"front":"a","back":"b"}]} and nothing else.',
  'Cut example: {"__kind":"q_and_a_set","items":[',
];

describe("catalog prose reads a kind example as its label (R1)", () => {
  it.each(SHAPES)("no kind key survives: %s", (text) => {
    const out = catalogProseText(text);
    expect(hasKindKey(out)).toBe(false);
    expect(out).not.toContain("__kind");
    expect(out).not.toContain("**");
  });

  it("names the kind in place and keeps the prose around it", () => {
    expect(catalogProseText(SHAPES[0])).toBe(
      "How and when to emit a meta_tag_options render block as canonical Meta Tag Options JSON: the exact shape, required fields, and JSON syntax rules.",
    );
    expect(catalogProseText(SHAPES[2])).toContain("Cells · Flashcard Set");
  });

  it("kindless prose and empty values pass through", () => {
    expect(catalogProseText("Writes a blog post.")).toBe("Writes a blog post.");
    expect(catalogProseText(null)).toBe("");
    expect(catalogProseText(undefined)).toBe("");
  });

  it("a search subtitle holding the same description reads clean (S1 snippet door)", () => {
    for (const text of SHAPES) expect(snippetKindText(text)).not.toContain("__kind");
  });
});

describe("every skill-description render site goes through catalogProseText", () => {
  const root = path.resolve(__dirname, "../../..");
  const SITES: Array<[string, RegExp]> = [
    ["../aidream/apps/shared/chat/src/agents/components/inputs/smart-input/RunSkillPicker.tsx", /(?:secondary|title)[:=]\s*\{?\s*skill\??\.description/],
    ["features/skills/components/SkillConfigPicker.tsx", /\{skill\??\.description|title=\{skill\??\.description/],
    ["features/skills/components/SkillsBrowser.tsx", /(?<!\$)\{s\.description\}/],
    ["features/skills/components/SkillDetailView.tsx", /\{skill\.description/],
    ["../aidream/apps/shared/chat/src/tool-call-visualization/renderers/skill/SkillInline.tsx", /result\.description\.trim\(\)\s*:/],
  ];
  it.each(SITES)("%s draws no raw description", (file, raw) => {
    const source = readFileSync(path.join(root, file), "utf8");
    expect(source).not.toMatch(raw);
    expect(source).toContain("catalogProseText(");
  });
});
