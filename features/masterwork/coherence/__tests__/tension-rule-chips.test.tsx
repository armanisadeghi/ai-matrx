/**
 * THE RULES A QUESTION IS ABOUT ARE NAMED ONCE, NAMED IN WORDS, AND SEPARATE.
 *
 * Found live on `/masterwork/<id>` as a first-time Expert would read it
 * (jobs-bar-2026-09-16, items 14–16). The "A few things only you can settle"
 * card rendered `tension.rule_ids.map(...)` straight onto the page:
 *
 *   1. `rule_ids` arrives from the server with the SAME id twice, so the page
 *      printed one rule's name twice in a row — and React got two children
 *      with the same key. Live text on the Gio Valiante Rulebook:
 *        "Build self-efficacy through its four sources
 *         Build self-efficacy through its four sources"
 *   2. The names were bare links in a 4px flex gap, so two of them read as one
 *      run-on sentence: "Mastery mindset is what remains, not what you install
 *      Build self-efficacy through its four sources".
 *   3. `rule?.name ?? ruleId` would have printed a raw UUID at a non-technical
 *      Expert; `openTensions` happens to filter those tensions out today, so
 *      the guard against it is defensive and is not what these tests prove.
 *
 * Proven failing-then-passing: restore `tension.rule_ids.map` without the
 * `new Set` and the first test fails; collapse the chips back to bare links in
 * one text node and the second fails.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { OpenQuestionsCard } from "../OpenQuestionsCard";
import type { Rulebook, RulebookRule } from "../../types";
import type { Tension } from "../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const KEPT_ID = "3f7c1d2a-0000-4000-8000-000000000001";
const SECOND_ID = "9a1b2c3d-0000-4000-8000-000000000002";
const FIRST_NAME = "Build self-efficacy through its four sources";
const SECOND_NAME = "Mastery mindset is what remains, not what you install";

function rule(id: string, name: string): RulebookRule {
  return { id, name, section: "G", statement: name, severity: "major" };
}

function tension(ruleIds: string[]): Tension {
  return {
    id: "tension-1",
    kind: "contradiction",
    rule_ids: ruleIds,
    question: "Which of these two do you actually mean?",
    why: "A reader cannot tell which one to follow.",
    options: ["The first one", "The second one"],
    recommendation: "",
    confidence: 0.8,
    state: "open",
    detected_at: "2026-09-16T00:00:00.000Z",
    rulebook_version: 3,
  };
}

function rulebookWith(ruleIds: string[]): Rulebook {
  return {
    id: "rulebook-1",
    name: "A Rulebook",
    rules: [rule(KEPT_ID, FIRST_NAME), rule(SECOND_ID, SECOND_NAME)],
    metadata: { coherence: { tensions: [tension(ruleIds)] } },
  } as unknown as Rulebook;
}

function render(ruleIds: string[]): { host: HTMLDivElement; root: Root } {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <OpenQuestionsCard
        rulebook={rulebookWith(ruleIds)}
        canEdit
        onSettled={() => undefined}
        onTalkItThrough={() => undefined}
        onOpenRule={() => undefined}
      />,
    );
  });
  return { host, root };
}

function chipLabels(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll("button"))
    .map((b) => (b.textContent ?? "").trim())
    .filter((t) => t === FIRST_NAME);
}

describe("the rules a settling question points at", () => {
  it("names a repeated rule ONCE, not once per id", () => {
    const { host, root } = render([KEPT_ID, KEPT_ID]);
    expect(chipLabels(host)).toHaveLength(1);
    act(() => root.unmount());
    host.remove();
  });

  it("gives each named rule its own control, never one run-on line", () => {
    const { host, root } = render([KEPT_ID, SECOND_ID]);
    const names = Array.from(host.querySelectorAll("button"))
      .map((b) => (b.textContent ?? "").trim())
      .filter((t) => t === FIRST_NAME || t === SECOND_NAME);
    expect(names.sort()).toEqual([SECOND_NAME, FIRST_NAME].sort());
    act(() => root.unmount());
    host.remove();
  });
});
