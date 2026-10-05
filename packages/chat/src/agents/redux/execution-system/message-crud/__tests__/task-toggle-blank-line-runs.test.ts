/**
 * A task checkbox ticked in an answer whose stored text has a run of 3+ blank
 * lines (a model's `</artifact>\n\n\n---`) must save. The renderer hands the
 * toggle the source with the run intact; the stored-text display scrub
 * collapses it, so the "answer changed since shown" guard refused every tick
 * and the box snapped back (live walk 2026-10-05, the pancake recipe card).
 *
 * Use case: a home cook ticks "2 tbsp sugar" while prepping the recipe card.
 */
import { projectAnswerText, spliceDisplayEdit, spliceAnswerText } from "../answer-text-splice";

const STORED = [
  "Here is your card.",
  "",
  "---",
  "",
  "<artifact type=\"table\" id=\"a\" version=\"1\" title=\"Table 1\">",
  "| A | B |",
  "| :-- | :-- |",
  "| 1 | 2 |",
  "</artifact>",
  "",
  "",
  "---",
  "",
  "**Dry**",
  "- [ ] **2 cups** flour",
  "- [ ] **2 tbsp** sugar",
].join("\n");

describe("ticking a task in an answer with a run of blank lines", () => {
  test("the stored text really has the 3-newline run", () => {
    expect(STORED).toContain("</artifact>\n\n\n---");
  });

  test("the toggle (display = stored, as the renderer holds it) is saved, only that box changes", () => {
    const next = STORED.replace("- [ ] **2 tbsp** sugar", "- [x] **2 tbsp** sugar");
    const result = spliceDisplayEdit(STORED, STORED, next);
    expect("error" in result ? result.error : "").toBe("");
    if ("error" in result) return;
    expect(result.text).toBe(next);
    const plan = spliceAnswerText([{ type: "text", text: STORED }], result.text);
    expect(plan).toMatchObject({ changed: true });
    expect(projectAnswerText([{ type: "text", text: STORED }]).text).toBe(STORED);
  });
});
