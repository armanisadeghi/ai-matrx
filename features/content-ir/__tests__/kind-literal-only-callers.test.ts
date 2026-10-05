/**
 * NO LITERAL-ONLY KIND DETECTION IN TEXT CONTEXTS (kind-never-raw round 9,
 * L-2 / L-3 / L-5). A text surface that asked "is there a kind?" with the
 * literal `"__kind"` alone missed every other realistic spelling — an escaped
 * tool result, a Python repr, a JavaScript object literal from a sandbox — and
 * drew it raw. Each caller below now reads through the normalizing detector.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { responseCanvasTarget } from "@/features/agent-apps/utils/response-canvas-target";
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
    expect(markdownCarriesKind(`Tool output: ${js}`)).toBe(true);
  });
  it("prose reads it as its one-line label", () => {
    expect(spelledKindsAsOneLine(`Tool output: ${js} Done.`)).toBe("Tool output: **Cell biology** · Flashcard Set Done.");
  });
  it("a JSON context keeps the literal rule (an unquoted key is not JSON)", () => {
    expect(jsonKindSignal(js)).not.toBe("kind");
  });
});

describe("L-3 — text callers read every realistic spelling", () => {
  it.each(SPELLED)("%s: the response canvas opens the kind", (_name, spelled) => {
    expect(responseCanvasTarget(`Here you go: ${spelled}`, "App").mode).toBe("kind");
  });
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
  it.each(SPELLED)("%s in a reason reads as the label, every other word kept", (_name, spelled) => {
    const out = catalogProseText(`Candidate lost: it returned ${spelled} instead of a quiz.`);
    expect(out).toContain("Candidate lost: it returned");
    expect(out).toContain("instead of a quiz.");
    expect(out).toContain("Flashcard Set");
    expect(out).not.toMatch(/__kind/);
  });
});
