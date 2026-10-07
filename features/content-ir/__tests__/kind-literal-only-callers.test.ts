/**
 * NO LITERAL-ONLY KIND DETECTION IN TEXT CONTEXTS (kind-never-raw round 9,
 * L-2 / L-3 / L-5). A text surface that asked "is there a kind?" with the
 * literal `"__kind"` alone missed every other realistic spelling — an escaped
 * tool result, a Python repr, a JavaScript object literal from a sandbox — and
 * drew it raw. Each caller below now reads through the normalizing detector.
 *
 * ROUND 10 (302f4ceed7, 11ec229496, 0072e32abd): only REAL JSON is lifted or converted. A
 * Python repr, JavaScript literal or backslash-escaped key in free text is DETECTION ONLY —
 * the sentinel / detectors still see it; no reader rewrites it to a label or opens a kind.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { messageMayContainKindBlock } from "@/features/content-ir/studio/message-kind-gate";
import { kindOf } from "@/components/rich-editor/islands/island-meta";
import {
  ALL_KIND_SPELLINGS,
  firstKindSlug,
  hasKindKeyAnySpelling,
  jsonKindSignal,
  markdownCarriesKind,
} from "@/features/content-ir/surfaces/json-kind-signal";
import { catalogProseText, spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
import { screenTextHoldsKind } from "@/features/content-ir/surfaces/kind-leak-scan";

const KIND = { __kind: "flashcard_set", title: "Cell biology", cards: [{ front: "Q?", back: "A" }] };
const JSON_TEXT = JSON.stringify(KIND);
const SPELLED: ReadonlyArray<readonly [string, string]> = [
  ["escaped", JSON_TEXT.replaceAll('"', '\\"')],
  ["python repr", "{'__kind': 'flashcard_set', 'title': 'Cell biology', 'cards': []}"],
  ["javascript literal", "{ __kind: 'flashcard_set', title: 'Cell biology', cards: [] }"],
];

describe("L-2 — a JavaScript object literal is a kind everywhere text is read", () => {
  const js = "{ __kind: 'flashcard_set', title: 'Cell biology', cards: [ { front: 'Q?', back: 'A' } ] }";
  it("the detector, the slug reader, the sentinel and the markdown gate see it", () => {
    expect(hasKindKeyAnySpelling(`Tool output: ${js}`)).toBe(true);
    expect(firstKindSlug(js, ALL_KIND_SPELLINGS)).toBe("flashcard_set");
    expect(jsonKindSignal(js, ALL_KIND_SPELLINGS)).toBe("kind");
    expect(screenTextHoldsKind(`Tool output: ${js}`)).toBe(true);
    // Detection only (round 10): the markdown gate does not lift a JS literal.
    expect(markdownCarriesKind(`Tool output: ${js}`)).toBe(false);
  });
  it("prose leaves it exactly as written (round 10: detection only, never converted)", () => {
    expect(spelledKindsAsOneLine(`Tool output: ${js} Done.`)).toBe(`Tool output: ${js} Done.`);
  });
  it("a JSON context keeps the literal rule (an unquoted key is not JSON)", () => {
    expect(jsonKindSignal(js)).not.toBe("kind");
  });
});

describe("L-3 — text callers read every realistic spelling", () => {
  it.each(SPELLED)("%s: the Save to my Shapes gate sees it", (_name, spelled) => {
    expect(messageMayContainKindBlock(`Here you go: ${spelled}`)).toBe(true);
  });
  it.each(SPELLED)("%s: an island names its kind", (_name, spelled) => {
    expect(kindOf(spelled)).toBe("flashcard_set");
  });

  const root = join(__dirname, "..", "..", "..");
  it.each([
    "features/code-editor/agent-code-editor/components/parts/ErrorPanel.tsx",
    "features/code-editor/components/AICodeEditor.tsx",
  ])("%s routes the raw AI response through the any-spelling detector", (file) => {
    const source = readFileSync(join(root, file), "utf8");
    expect(source).toContain("hasKindKeyAnySpelling(rawAIResponse)");
    expect(source).not.toMatch(/\bhasKindKey\(rawAIResponse\)/);
  });
  it("the labelled Raw AI Response view is a marked source view", () => {
    const source = readFileSync(join(root, "features/code-editor/components/AICodeEditor.tsx"), "utf8");
    expect(source).toMatch(/<pre \{\.\.\.KIND_SOURCE_PROPS\}/);
  });
});

describe("L-5 — the factory build's Why panel reads a kind as its label", () => {
  const root = join(__dirname, "..", "..", "..");
  it("the reason / error text passes through the one-line reader", () => {
    const source = readFileSync(join(root, "features/agents/factory/components/BuildProgress.tsx"), "utf8");
    expect(source).toContain("{catalogProseText(reason ?? state.error)}");
    expect(source).not.toMatch(/>\s*\{reason \?\? state\.error\}\s*</);
  });
  it.each(SPELLED)("%s in a reason is kept exactly as written, every other word kept (round 10)", (_name, spelled) => {
    const out = catalogProseText(`Candidate lost: it returned ${spelled} instead of a quiz.`);
    expect(out).toBe(`Candidate lost: it returned ${spelled} instead of a quiz.`);
    expect(screenTextHoldsKind(out)).toBe(true);
  });
  it("a real JSON kind in a reason still reads as the label", () => {
    const out = catalogProseText(`Candidate lost: it returned ${JSON_TEXT} instead of a quiz.`);
    expect(out).toContain("Flashcard Set");
    expect(out).toContain("instead of a quiz.");
    expect(out).not.toMatch(/__kind/);
  });
});
