/**
 * The pure rules of block state: identity (B5), the chip rule, and what stays local.
 * Use case: Dana ticks 3 of 8 ingredients, slides to slide 4, sorts a comparison — only the ticks are hers to keep.
 */
import { blockKeyFor, fingerprintOf } from "../blockKey";
import { isChipDue, type BlockStateRow } from "../types";
import { splitKindState } from "@/features/content-ir/react/kind-interaction";

const row = (over: Partial<BlockStateRow>): BlockStateRow => ({
  id: "11111111-1111-4111-8111-111111111111",
  entity_type: "message",
  entity_id: "22222222-2222-4222-8222-222222222222",
  block_key: "recipe:fp:abc",
  kind: "recipe",
  scope: "viewer",
  viewer_id: null,
  state: {},
  state_version: 3,
  sent_version: 0,
  fingerprint: null,
  metadata: {},
  version: 1,
  ...over,
});

describe("block identity: declared id, then fingerprint, then ordinal", () => {
  it("prefers the declared id over everything", () => {
    expect(blockKeyFor({ kind: "questionnaire", declaredId: "intake-1", fingerprint: "abc", ordinal: 2 })).toBe("questionnaire:id:intake-1");
  });
  it("falls back to the content fingerprint, then the ordinal, then nothing", () => {
    expect(blockKeyFor({ kind: "recipe", fingerprint: "abc", ordinal: 1 })).toBe("recipe:fp:abc");
    expect(blockKeyFor({ kind: "recipe", ordinal: 1 })).toBe("recipe:1");
    expect(blockKeyFor({ kind: "recipe" })).toBeNull();
  });
  it("a block whose content changed is a different block; neighbours do not move it", () => {
    expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }));
    expect(fingerprintOf({ a: 1 })).toBe(fingerprintOf({ a: 1 }));
  });
});

describe("the chip rule (server contract)", () => {
  it("is due while saved newer than sent", () => {
    expect(isChipDue(row({ state_version: 3, sent_version: 2 }))).toBe(true);
  });
  it("clears when the message that carried it is sent", () => {
    expect(isChipDue(row({ state_version: 3, sent_version: 3 }))).toBe(false);
  });
  it("clears at the dismissed version and returns with the next change", () => {
    expect(isChipDue(row({ state_version: 3, metadata: { chip_dismissed_version: 3 } }))).toBe(false);
    expect(isChipDue(row({ state_version: 4, metadata: { chip_dismissed_version: 3 } }))).toBe(true);
  });
});

describe("what stays local", () => {
  it("a recipe keeps ticks and servings, not anything else", () => {
    expect(splitKindState("recipe", { checkedIngredients: [1], expanded: true })).toEqual({
      durable: { checkedIngredients: [1] },
      view: { expanded: true },
    });
  });
  it("a presentation's current slide and a comparison's sort never leave the browser", () => {
    expect(splitKindState("presentation", { currentSlide: 3 }).durable).toEqual({});
    expect(splitKindState("comparison", { sortBy: "price" }).durable).toEqual({});
  });
  it("a questionnaire's form and a quiz session are the person's work", () => {
    expect(splitKindState("questionnaire", { formState: { q: "a" } }).durable).toEqual({ formState: { q: "a" } });
    expect(splitKindState("quiz", { quizState: {}, results: null }).view).toEqual({});
  });
  it("a decision tree's path is saved under its canvas name too", () => {
    expect(splitKindState("decision-tree", { currentNodeId: "n2", history: [] }).durable).toEqual({ currentNodeId: "n2", history: [] });
  });
});
