/** Real user turns from the live walk of 2026-10-04 (chat.message positions 2 and 4). */
import { literalUserText } from "../literal-user-text";

describe("literalUserText", () => {
  it("escapes a typed <decision> opener so it renders as typed", () => {
    expect(
      literalUserText(
        'Which launch channel should we start with? Answer using a <decision prompt="Pick our first launch channel"> block with three options.',
      ),
    ).toBe(
      'Which launch channel should we start with? Answer using a &lt;decision prompt="Pick our first launch channel"> block with three options.',
    );
  });
  it("escapes the typed <option> children too", () => {
    expect(
      literalUserText(
        'Answer using a <decision prompt="Pick a pricing model"> block with three <option id=".." label=".."> children; start every tag at the beginning of a line, no indentation.',
      ),
    ).toBe(
      'Answer using a &lt;decision prompt="Pick a pricing model"> block with three &lt;option id=".." label=".."> children; start every tag at the beginning of a line, no indentation.',
    );
  });
  it("escapes a bare <questionnaire> mention", () => {
    expect(literalUserText("Give me a short questionnaire about my launch using a <questionnaire> block.")).toBe(
      "Give me a short questionnaire about my launch using a &lt;questionnaire> block.",
    );
  });
  it("leaves code spans, fences, editor pills and plain text alone", () => {
    const keep = [
      "use `<decision prompt=\"x\">` here",
      "```xml\n<decision prompt=\"x\">\n```",
      '<editor_error file="a.ts" line="3">boom</editor_error>',
      "a < b and c > d, <b>bold</b>",
    ];
    for (const t of keep) expect(literalUserText(t)).toBe(t);
  });
});
