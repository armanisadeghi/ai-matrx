import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  capabilitySentence,
  familyWords,
  PRIMARY_FORM_CHOICES,
  primaryFormShortLabel,
} from "./resource-family-words";

/**
 * The file-family chooser is read by non-technical experts (the one Source
 * input) and by chat. Every choice is said as an outcome; storage keys, tool
 * names and categories never reach the screen.
 */

/** Every key `get_file_resource_family` can return (live RPC, 2026-09-27). */
const SERVER_KEYS = [
  "file_metadata",
  "file_variants",
  "clean",
  "raw",
  "pages",
  "pdf",
  "knowledge_assets",
  "rag",
  "image_metadata",
  "file_analysis",
  "analysis_results",
  "detected_entities",
  "page_annotations",
  "overrides",
  "file_structure",
];

const JARGON = /\b(RAG|chunks?|metadata|entities|representation|derivative|lineage|inline|context|document_content|knowledge_search)\b/i;

describe("the file-family chooser speaks in outcomes", () => {
  it("names every server key in plain words", () => {
    for (const key of SERVER_KEYS) {
      const words = familyWords(key, `SERVER:${key}`, 3);
      expect(words.label).not.toContain("SERVER:");
      expect(words.label).not.toMatch(JARGON);
      expect(words.detail).not.toMatch(JARGON);
    }
  });

  it("explains each primary form by what it gives and costs", () => {
    const byValue = Object.fromEntries(PRIMARY_FORM_CHOICES.map((c) => [c.value, c]));
    expect(byValue.clean.detail).toMatch(/best for most things/i);
    expect(byValue.pdf.detail).toMatch(/layout and images/i);
    expect(byValue.pdf.detail).toMatch(/more space/i);
    expect(primaryFormShortLabel(undefined)).toBe("Best available");
  });

  it("says tool names as what they let the AI do", () => {
    const sentence = capabilitySentence(["context", "document_content", "knowledge_search"]);
    expect(sentence).not.toMatch(/_/);
    expect(sentence).toMatch(/find the passages it needs/);
    expect(capabilitySentence([])).toBeNull();
  });

  it("never renders a raw key, category or tool name in the editor", () => {
    const source = readFileSync(resolve(__dirname, "ResourceFamilyPolicyEditor.tsx"), "utf8");
    // The old line was `{item.count} · {item.category} · {item.fetch_tool}`.
    expect(source).not.toMatch(/\{item\.(category|fetch_tool)\}/);
    expect(source).not.toMatch(/>\s*\{item\.label\}/);
    expect(source).not.toMatch(/Resource family|Primary content|Inline previews|Free tools/);
  });
});
