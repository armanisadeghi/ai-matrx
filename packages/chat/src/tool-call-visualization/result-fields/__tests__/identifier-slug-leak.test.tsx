// features/tool-call-visualization/result-fields/__tests__/identifier-slug-leak.test.tsx
//
// THE SLUG-LEAK GUARD, on the platform's structured-rendering FLOOR.
//
// Found by the teach-parenting-pair judge on the parent-facing Masterwork
// showcase (common-docs/projects/teach-parenting-pair/BENCHMARK-SIMPLE-PATH.md):
// raw rule-id slugs — `bedtime-and-bath-schedule`, `avoid-restraining-practices`
// — rendered beside each instruction on a screen written for a parent.
//
// The cause was a value-shape gate, not a missing rule. The floor already knew
// `rule_id` was an identifier key (`isIdentifierKey`), but only gave it the
// quiet identifier treatment when the VALUE looked like a UUID
// (`looksLikeUuid`). A Masterwork rule id is a human-authored slug, so it fell
// straight through to a plain visible row — the id shown at the same weight as
// the instruction, next to a `rule_name` that was the actual human answer.
//
// The fixture is the REAL payload: `workflow.run.output->'deliver'` for run
// cef6ae07-4562-4dbd-a8e4-403309cace08, read out of the live database. No
// hand-shaped object — that is the payload the judge was looking at.

import React from "react";
import { renderToString } from "react-dom/server";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { isTechnicalTableColumn } from "../ResultTable";
import { isIdentifierKey, humanNameSiblingKey } from "../KeyValueGrid";

import deliver from "./fixtures/masterwork-run-cef6ae07-deliver.json";

/** Every rule-id slug that appears anywhere in the real run payload. */
const SLUGS = [
  "no-petting-the-raging-child",
  "love-is-built-by-stroking",
  "no-eating-at-all-hours",
  "let-child-conquer-difficulties",
  "rage-stimulus-is-hampering",
  "bedtime-and-bath-schedule",
  "reasoning-does-not-cure-fear",
];

/** The human names that MUST be on screen — the id's readable twin. */
const NAMES = [
  "Let the Child Conquer Difficulties",
  "Rage Stimulus is Hampering",
  "Bedtime and Bath Schedule",
];

describe("identifier keys are never the headline (the real Watson run)", () => {
  const html = () => renderToString(<StructuredValueView value={deliver} />);
  /** Text a reader actually sees — attributes (title=, aria-) stripped out,
   *  because an id parked on a hover is exactly what we are asking for. */
  const visibleText = (markup: string) =>
    markup
      .replace(/<[^>]*>/g, "\u0000")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");

  it("renders the rule NAMES to the reader", () => {
    const text = visibleText(html());
    for (const name of NAMES) {
      expect(text).toContain(name);
    }
  });

  it("never prints a raw rule-id slug as visible text", () => {
    const text = visibleText(html());
    for (const slug of SLUGS) {
      expect(text).not.toContain(slug);
    }
  });
});

describe("isIdentifierKey / isTechnicalTableColumn — key-shaped, never value-shaped", () => {
  it("classifies rule_id as an identifier regardless of what its value looks like", () => {
    expect(isIdentifierKey("rule_id")).toBe(true);
    expect(isIdentifierKey("ruleId")).toBe(true);
    expect(isIdentifierKey("rule_key")).toBe(true);
    expect(isIdentifierKey("slug")).toBe(true);
  });

  it("leaves genuinely readable keys alone", () => {
    expect(isIdentifierKey("rule_name")).toBe(false);
    expect(isIdentifierKey("instruction")).toBe(false);
    expect(isIdentifierKey("timing")).toBe(false);
    expect(isIdentifierKey("identity")).toBe(false);
    expect(isIdentifierKey("idea")).toBe(false);
  });

  it("keeps rule_id out of the reader's table columns", () => {
    expect(isTechnicalTableColumn("rule_id")).toBe(true);
    expect(isTechnicalTableColumn("rule_key")).toBe(true);
    expect(isTechnicalTableColumn("rule_name")).toBe(false);
    expect(isTechnicalTableColumn("instruction")).toBe(false);
  });
});

describe("humanNameSiblingKey — the id defers to the name beside it", () => {
  it("pairs an id with its own name field", () => {
    const row = { rule_id: "x", rule_name: "X", instruction: "do it" };
    expect(humanNameSiblingKey("rule_id", row)).toBe("rule_name");
  });

  it("pairs a bare id with a bare name", () => {
    expect(humanNameSiblingKey("id", { id: "x", name: "X" })).toBe("name");
    expect(humanNameSiblingKey("id", { id: "x", title: "X" })).toBe("title");
  });

  it("is null when the payload gives the reader no readable twin", () => {
    expect(humanNameSiblingKey("rule_id", { rule_id: "x" })).toBeNull();
    expect(humanNameSiblingKey("rule_name", { rule_id: "x", rule_name: "X" })).toBeNull();
  });
});
