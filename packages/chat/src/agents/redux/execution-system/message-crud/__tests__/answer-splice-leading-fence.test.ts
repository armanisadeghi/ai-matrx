/**
 * An answer that STARTS with a thread-reply region (a comment_reply fence
 * and/or its receipt line) must splice an edit made elsewhere in the answer
 * at the right place: words appended to the last paragraph land at its end,
 * never as a paragraph of their own above it (live walk 2026-10-05).
 *
 * Use case: a site lead's question on the scale-weighing answer got a thread
 * reply; she then adds a closing sentence to the answer's paragraph.
 */
import { projectAnswerText, spliceAnswerText, spliceDisplayEdit, displayOfStoredAnswer } from "../answer-text-splice";

const FENCE =
  '```directive_v1_action_comment_reply\n{"items":[{"to":"c1","body":"The truck scale."}]}\n```';
const PARA =
  "Weigh every inbound load before it reaches the baler, and log the ticket number against the supplier.";

const SHAPES: Record<string, unknown[]> = {
  "fence leads the same text part": [{ type: "text", text: `${FENCE}\n\n${PARA}` }],
  "fence is its own text part": [{ type: "text", text: FENCE }, { type: "text", text: `\n\n${PARA}` }],
  "a non-text part leads": [
    { type: "kind_value", text: "Replied in the thread on c1." },
    { type: "text", text: PARA },
  ],
  "thinking then fence then text": [
    { type: "thinking", text: "private" },
    { type: "text", text: `${FENCE}\n\n${PARA}` },
  ],
};

describe.each(Object.entries(SHAPES))("%s", (_name, content) => {
  const stored = projectAnswerText(content).text;
  const appended = `${stored} Celebrate with the team.`;

  test("whole-text append lands at the end of the paragraph", () => {
    const plan = spliceAnswerText(content, appended);
    expect(plan).toMatchObject({ changed: true });
    if (!("content" in plan)) throw new Error("no content");
    expect(projectAnswerText(plan.content).text).toBe(appended);
    expect(projectAnswerText(plan.content).text.indexOf("Celebrate")).toBeGreaterThan(stored.indexOf("baler"));
  });

  test("a display edit appends at the end of the paragraph", () => {
    const previous = displayOfStoredAnswer(stored);
    const result = spliceDisplayEdit(stored, previous, `${previous} Celebrate with the team.`);
    if ("error" in result) throw new Error(result.error);
    expect(result.text).toBe(appended);
  });
});
