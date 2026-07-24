/**
 * Deterministic content-block generator — the no-LLM `content_block` leg.
 * Asserts: emit shape always leads with `__kind`; the real canonical example is
 * preferred and re-rooted; the detailed tier annotates required markers, enums,
 * and nested item structure; a non-object schema degrades to a loud dump; and
 * the same inputs produce a byte-identical block (stable upsert key).
 */

import {
  generateKindContentBlock,
  contentBlockIdFor,
} from "@/features/content-ir/registry/kind-content-block-generator";
import type { Json } from "@/types/database.types";

const KEYWORD_SCHEMA: Json = {
  type: "object",
  required: ["primary_keyword", "keyword_lists"],
  additionalProperties: false,
  properties: {
    primary_keyword: {
      type: "string",
      description: "The seed keyword all lists relate to.",
    },
    keyword_lists: {
      type: "array",
      description: "Categorized lists of keywords.",
      items: {
        type: "object",
        required: ["label", "keywords"],
        additionalProperties: false,
        properties: {
          label: { type: "string", description: "The category name for this list." },
          keywords: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

const KEYWORD_EXAMPLE = {
  primary_keyword: "content marketing",
  keyword_lists: [{ label: "Parent Keywords", keywords: ["marketing", "content"] }],
};

describe("generateKindContentBlock", () => {
  it("basic tier leads the sample with __kind and stays compact", () => {
    const block = generateKindContentBlock({
      kind: "keyword_relationship_research",
      label: "Keyword Relationship Research",
      emittedJsonSchema: KEYWORD_SCHEMA,
      canonicalExample: KEYWORD_EXAMPLE,
      tier: "basic",
    });
    expect(block.blockId).toBe("kind-keyword-relationship-research-simple");
    expect(block.template).toContain('"__kind":"keyword_relationship_research"');
    // Compact sample (basic tier) — one JSON line inside the fence.
    const fence = block.template.split("```json\n")[1].split("\n```")[0];
    expect(fence).not.toContain("\n");
    const parsed = JSON.parse(fence) as Record<string, unknown>;
    expect(parsed.__kind).toBe("keyword_relationship_research");
    expect(parsed.primary_keyword).toBe("content marketing");
  });

  it("detailed tier annotates required markers, and nested item fields", () => {
    const block = generateKindContentBlock({
      kind: "keyword_relationship_research",
      label: "Keyword Relationship Research",
      emittedJsonSchema: KEYWORD_SCHEMA,
      canonicalExample: KEYWORD_EXAMPLE,
      tier: "detailed",
    });
    expect(block.blockId).toBe("kind-keyword-relationship-research-full");
    // Required field carries the escaped star; description is inlined.
    expect(block.template).toContain("`primary_keyword`\\* (string)");
    expect(block.template).toContain("`keyword_lists`\\* (object[])");
    // Nested array item structure is described under its own heading.
    expect(block.template).toContain("Each `keyword_lists` item");
    expect(block.template).toContain("`label`\\* (string)");
    // Pretty sample still leads with __kind.
    expect(block.template).toContain('"__kind": "keyword_relationship_research"');
  });

  it("renders enum fields as a value union", () => {
    const block = generateKindContentBlock({
      kind: "flashcard",
      label: "Flashcard",
      emittedJsonSchema: {
        type: "object",
        required: ["front"],
        properties: {
          front: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
        },
      },
      tier: "detailed",
    });
    expect(block.template).toContain("`difficulty` ∈ `easy | medium | hard`");
  });

  it("synthesizes a sample from the schema when no example is supplied", () => {
    const block = generateKindContentBlock({
      kind: "keyword_relationship_research",
      label: "Keyword Relationship Research",
      emittedJsonSchema: KEYWORD_SCHEMA,
      tier: "basic",
    });
    const fence = block.template.split("```json\n")[1].split("\n```")[0];
    const parsed = JSON.parse(fence) as Record<string, unknown>;
    expect(parsed.__kind).toBe("keyword_relationship_research");
    expect(Array.isArray(parsed.keyword_lists)).toBe(true);
  });

  it("degrades loudly to a schema dump for a non-object schema", () => {
    const block = generateKindContentBlock({
      kind: "tag_list",
      label: "Tag List",
      emittedJsonSchema: { type: "array", items: { type: "string" } },
      canonicalExample: ["a", "b"],
      tier: "detailed",
    });
    expect(block.template).toContain("Schema:");
    expect(block.template).toContain('"type": "array"');
  });

  it("is deterministic — identical inputs produce an identical block", () => {
    const input = {
      kind: "keyword_relationship_research",
      label: "Keyword Relationship Research",
      emittedJsonSchema: KEYWORD_SCHEMA,
      canonicalExample: KEYWORD_EXAMPLE,
      tier: "detailed" as const,
    };
    expect(generateKindContentBlock(input)).toEqual(generateKindContentBlock(input));
  });

  it("derives stable, hyphenated block ids per tier", () => {
    expect(contentBlockIdFor("keyword_relationship_research", "basic")).toBe(
      "kind-keyword-relationship-research-simple",
    );
    expect(contentBlockIdFor("keyword_relationship_research", "detailed")).toBe(
      "kind-keyword-relationship-research-full",
    );
  });
});
