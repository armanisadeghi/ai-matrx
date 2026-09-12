/**
 * `rule_draft` end to end against a FAKE Rulebook — the surface write target
 * the Masterwork Conductor was promised and could not use (live defect,
 * 2026-09-12, conversation 2546a1d2-61fc-49af-b894-9577235bec12).
 *
 * The agent's value goes through the ONE validator every mount of the surface
 * uses (`requireRuleDraftInput`), the editor's result goes through the ONE save
 * the lane routes use (`saveEditedRule`), and the only thing faked is the
 * Rulebook store underneath the canonical CAS upsert.
 */

const upsertRuleWithRetry = jest.fn();

jest.mock("../service", () => ({
  upsertRuleWithRetry: (...args: unknown[]) => upsertRuleWithRetry(...args),
}));

import { requireRuleDraftInput } from "../agent-context/ruleDraftInput";
import { saveEditedRule } from "../ruleSave";
import type { Rulebook, RulebookRule } from "../types";

const approvedRule: RulebookRule = {
  id: "R1",
  name: "Mark the spot",
  section: "U",
  statement: "Mark the spot and ask the writer.",
  severity: "major",
};

const draftRule: RulebookRule = {
  ...approvedRule,
  id: "R2",
  name: "Never invent",
  draft: true,
  rejected: true,
  feedback: "Too vague.",
};

function fakeRulebook(): Rulebook {
  return {
    id: "RB1",
    version: 4,
    sections: { U: { label: "Elementary Rules of Usage" } },
    rules: [approvedRule, draftRule],
  } as unknown as Rulebook;
}

/** The fake store: applies the upsert the way the real service would. */
function fakeStore(rulebook: Rulebook) {
  upsertRuleWithRetry.mockImplementation(
    async ({ rule }: { rulebookId: string; rule: RulebookRule }) => {
      const exists = rulebook.rules.some((r) => r.id === rule.id);
      return {
        ...rulebook,
        version: rulebook.version + 1,
        rules: exists
          ? rulebook.rules.map((r) => (r.id === rule.id ? rule : r))
          : [...rulebook.rules, rule],
      };
    },
  );
}

describe("rule_draft → the Rulebook", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stages an agent's new-rule value and lands it through the canonical upsert", async () => {
    const rulebook = fakeRulebook();
    fakeStore(rulebook);

    const { draft, initial } = requireRuleDraftInput(
      {
        mode: "new",
        name: "Ask the writer",
        statement: "Mark the spot and ask the writer instead of inventing.",
        rationale: "Invented facts are the one thing an editor must never add.",
        severity: "critical",
        section: "U",
      },
      rulebook,
    );
    expect(initial).toBeUndefined();
    expect(draft).toMatchObject({ mode: "new", section: "U" });

    // What the editor hands back when the Expert presses Save.
    const saved = await saveEditedRule({
      rulebook,
      isNew: true,
      rule: {
        id: "R3",
        name: draft.name!,
        section: draft.section!,
        statement: draft.statement!,
        rationale: draft.rationale,
        severity: "critical",
      },
    });

    expect(upsertRuleWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ rulebookId: "RB1" }),
    );
    expect(saved.version).toBe(5);
    expect(saved.rules.map((r) => r.id)).toEqual(["R1", "R2", "R3"]);
  });

  it("keeps a draft a draft on edit — saving is not approving", async () => {
    const rulebook = fakeRulebook();
    fakeStore(rulebook);

    const { initial } = requireRuleDraftInput(
      { mode: "edit", rule_id: "R2", statement: "Never invent a fact." },
      rulebook,
    );
    expect(initial).toBe(draftRule);

    const saved = await saveEditedRule({
      rulebook,
      isNew: false,
      rule: { ...draftRule, statement: "Never invent a fact." },
    });

    const landed = saved.rules.find((r) => r.id === "R2")!;
    expect(landed.draft).toBe(true);
    // A content-changing edit by the Expert's own hand resolves the review note.
    expect(landed.rejected).toBeUndefined();
    expect(landed.feedback).toBeUndefined();
  });

  it("refuses a bad agent value before anything is staged or written", async () => {
    const rulebook = fakeRulebook();
    fakeStore(rulebook);

    expect(() => requireRuleDraftInput({ mode: "sideways" }, rulebook)).toThrow(
      'Rule draft mode must be "new" or "edit".',
    );
    expect(() =>
      requireRuleDraftInput({ mode: "edit", rule_id: "nope" }, rulebook),
    ).toThrow("Edit mode needs a rule_id that exists in the open Rulebook.");
    expect(() =>
      requireRuleDraftInput({ mode: "new", section: "ZZ" }, rulebook),
    ).toThrow("Rule draft section must be one of the section codes");
    expect(() =>
      requireRuleDraftInput({ mode: "new", statement: 12 }, rulebook),
    ).toThrow("Rule draft statement must be text.");
    expect(upsertRuleWithRetry).not.toHaveBeenCalled();
  });
});
