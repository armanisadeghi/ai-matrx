/**
 * EVERY UNIVERSAL ROW HAS A CATEGORY. Every action the rich-document registry
 * registers, and every row the menu engine contributes, is named by a rule of the
 * v2 grouping — none silently falls through to "No category yet".
 *
 * Break it names: a new registerAction(...) (or engine row) nobody categorized →
 * "uncategorized" red, listing the id.
 */
import "@/features/rich-document/actions/handlers";
import { getAllActions, toAlchemyAction } from "@/features/rich-document/actions/provider";
import { CONTEXT_MENU_ENGINE_ROWS } from "../engine-rows";
import { matchRule } from "../grouping";
import { PROPOSED_MENU_GROUPING } from "../proposed-grouping";

describe("v2 grouping covers the whole inventory", () => {
  it("uncategorized: no registered row falls through to the fallback", () => {
    const rich = getAllActions().map((rd) => toAlchemyAction(rd));
    expect(rich.length).toBeGreaterThan(50);
    const rows = [...CONTEXT_MENU_ENGINE_ROWS.map((r) => ({ id: r.id, category: r.category })), ...rich];
    const uncategorized = rows.filter((a) => !matchRule(PROPOSED_MENU_GROUPING, a)).map((a) => a.id);
    expect(uncategorized).toEqual([]);
  });

  it("the retired broker action is gone from the registry", () => {
    expect(getAllActions().map((a) => a.id)).not.toContain("convert-to-broker");
  });
});
