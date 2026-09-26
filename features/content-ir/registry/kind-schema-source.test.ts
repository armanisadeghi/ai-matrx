/**
 * The app's ONE `SchemaSourcePort` (Matrx Alchemy ALC-13) and the validator
 * built on it.
 *
 * Only the network hop is faked (`getKindInputContractBySlug`, a Supabase read
 * of `content_ir.kind_definition`). The port's mapping, `createKindValidator`,
 * `validateStructuralLeg` and ajv all run for real.
 *
 * Break this guards: the port answering "available" for an unregistered kind
 * or a kind with no schema (a skip becoming a pass), or losing the version.
 */

const mockGetKindInputContract = jest.fn();
jest.mock("@/features/content-ir/registry/schema-source-kind-tables", () => ({
  getKindInputContractBySlug: (kind: string) => mockGetKindInputContract(kind),
}));

import { kindCatalogSchemaSource, kindValidator } from "./kind-schema-source";

/** The live `word_count_result` emitted_json_schema (read 2026-09-11). */
const WORD_COUNT_RESULT_SCHEMA = {
  type: "object",
  title: "WordCountOutput",
  required: ["characters", "characters_no_spaces", "words", "sentences", "paragraphs", "lines"],
  properties: {
    lines: { type: "integer", title: "Lines" },
    words: { type: "integer", title: "Words" },
    __kind: { type: "string", const: "word_count_result", default: "word_count_result" },
    sentences: { type: "integer", title: "Sentences" },
    characters: { type: "integer", title: "Characters" },
    paragraphs: { type: "integer", title: "Paragraphs" },
    characters_no_spaces: { type: "integer", title: "Characters No Spaces" },
  },
  additionalProperties: false,
};

/** A two-word proposal title, counted. */
const CONFORMING_VALUE = {
  __kind: "word_count_result",
  characters: 12,
  characters_no_spaces: 10,
  words: 2,
  sentences: 1,
  paragraphs: 1,
  lines: 1,
};

const signal = new AbortController().signal;

beforeEach(() => {
  mockGetKindInputContract.mockReset();
  kindValidator.invalidate();
});

describe("kindCatalogSchemaSource — the SchemaSourcePort contract", () => {
  it("answers a registered kind with its schema and version", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: WORD_COUNT_RESULT_SCHEMA,
      version: 7,
    });
    await expect(
      kindCatalogSchemaSource.kindSchema("word_count_result", signal),
    ).resolves.toEqual({ schema: WORD_COUNT_RESULT_SCHEMA, version: "7" });
    expect(mockGetKindInputContract).toHaveBeenCalledWith("word_count_result");
  });

  it("answers kind_not_registered when no live kind has the slug", async () => {
    mockGetKindInputContract.mockResolvedValue(null);
    await expect(
      kindCatalogSchemaSource.kindSchema("proposal_outline", signal),
    ).resolves.toEqual({ unavailable: "kind_not_registered" });
  });

  it("answers schema_unavailable when the kind has no emitted schema", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: null,
      version: 2,
    });
    await expect(
      kindCatalogSchemaSource.kindSchema("proposal_outline", signal),
    ).resolves.toEqual({ unavailable: "schema_unavailable" });
  });

  it("lets an unreachable catalog reach the validator as catalog_unreachable, naming the cause", async () => {
    mockGetKindInputContract.mockRejectedValue(
      new Error('Failed to fetch input contract for "word_count_result": fetch failed'),
    );
    const verdict = await kindValidator.validate(CONFORMING_VALUE, "word_count_result");
    expect(verdict.checked).toBe(false);
    expect(verdict.degradedReason).toBe("catalog_unreachable");
    expect(verdict.errors[0]).toContain("fetch failed");
  });
});

describe("kindValidator — the app's one validator over that port", () => {
  it("passes a conforming value and fails a malformed one, against the real schema", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: WORD_COUNT_RESULT_SCHEMA,
      version: 7,
    });
    expect((await kindValidator.validate(CONFORMING_VALUE, "word_count_result")).ok).toBe(true);
    const bad = await kindValidator.validate(
      { ...CONFORMING_VALUE, words: "two" },
      "word_count_result",
    );
    expect(bad.checked).toBe(true);
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toContain("words");
  });

  it("cachedSchema shares the validator's cache — one read for show-then-check", async () => {
    mockGetKindInputContract.mockResolvedValue({
      schema: null,
      emittedJsonSchema: WORD_COUNT_RESULT_SCHEMA,
      version: 7,
    });
    expect(await kindValidator.cachedSchema("word_count_result")).toEqual(
      WORD_COUNT_RESULT_SCHEMA,
    );
    await kindValidator.validate(CONFORMING_VALUE, "word_count_result");
    expect(mockGetKindInputContract).toHaveBeenCalledTimes(1);
  });
});
