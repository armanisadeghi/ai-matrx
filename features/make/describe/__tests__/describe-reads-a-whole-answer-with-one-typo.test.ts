// features/make/describe/__tests__/describe-reads-a-whole-answer-with-one-typo.test.ts
//
// THE USE CASE. The owner typed a creator's post tracker into /make (2026-10-08 01:40Z, conversation
// ac98d310-f5be-42d7-ac4f-e6fcc8105b24). The mandate answered 8,363 characters of minified JSON that
// visibly held `template` and `notes`, with ONE stray `]` after the template object (char 7,721). The
// client extraction (@ai-matrx/kit json-extract, 0.34.0 on the live build) returned nothing, so the
// headless run judged every required key missing and said "nothing was saved".
//
// BREAKS THIS CATCHES: the one extraction door (extractFirstJson, allowFuzzy — what
// runHeadlessAgentJson's fallback calls) losing whole-document repair, so a near-valid answer is thrown
// away; the repair inventing or dropping parts of the spec instead of keeping it whole.
//
// The fixture is the real stored answer, byte for byte (chat.message bcba65e6-5252-4b8c-abf8-c0253be4ad5e).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { extractFirstJson } from "@ai-matrx/kit/json-extract";

import { checkDescribeTemplate, coerceDescribeAnswer } from "../describeTemplate";

const ANSWER = readFileSync(join(__dirname, "fixtures/live-answer-creator-post-tracker-stray-bracket.txt"), "utf8");

describe("the describe box reads a whole answer that carries one typo", () => {
  it("the stored answer really is invalid JSON (the fixture keeps the defect)", () => {
    expect(() => JSON.parse(ANSWER)).toThrow();
  });

  it("recovers the whole answer — template, notes and reuses — through the one extraction door", () => {
    const r = extractFirstJson(ANSWER, { allowFuzzy: true });
    expect(r).not.toBeNull();
    expect(r?.repairApplied).toBe(true);
    const answer = coerceDescribeAnswer(r?.value);
    expect(answer.template.id).toBe("creator-post-tracker");
    const tables = answer.template.tables as Array<{ token: string }>;
    expect(tables.map((t) => t.token)).toEqual(["brand", "post", "post_result"]);
    expect((answer.template.views as unknown[]).length).toBe(3);
    expect((answer.template.forms as unknown[]).length).toBe(3);
    expect(answer.notes).toHaveLength(7);
    expect(answer.reuses).toEqual([]);
  });

  it("the recovered spec reaches the store's check as a spec, not as nothing", () => {
    const answer = coerceDescribeAnswer(extractFirstJson(ANSWER, { allowFuzzy: true })?.value);
    const checked = checkDescribeTemplate(answer.template);
    expect(checked.spec.tables.length).toBe(3);
  });
});
